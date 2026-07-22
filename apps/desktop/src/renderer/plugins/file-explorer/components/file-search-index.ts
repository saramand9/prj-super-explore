import type { FileEntry } from '@explore/shared';
import { pinyin } from 'pinyin-pro';

interface TrieNode {
  children: Map<string, TrieNode>;
  entries: FileEntry[];
}

/**
 * 统一文件搜索索引引擎。
 * 组合 Prefix Trie + Trigram 倒排索引 + 拼音扩展。
 * 根据查询特征自动选择最优匹配策略。
 */
export class FileSearchIndex {
  // Prefix Trie: 前缀搜索 O(k)
  private trieRoot: TrieNode = { children: new Map(), entries: [] };

  // Trigram 倒排索引: 子串搜索 O(1)
  private trigramIndex = new Map<string, Set<number>>();

  // 条目存储（用数字 ID 去重）
  private entryStore: FileEntry[] = [];
  private entryIdMap = new Map<string, number>(); // path → id

  // Cached phonetic variants used by trigram and substring searches.
  private pinyinData = new Map<number, { full: string; initials: string }>();

  private _ready = false;

  get isReady(): boolean {
    return this._ready;
  }

  get entryCount(): number {
    return this.entryStore.length;
  }

  /** 构建全部索引 */
  build(entries: FileEntry[]): void {
    this.clear();

    // 1. 分配 ID，建立条目表
    let nextId = 0;
    for (const entry of entries) {
      if (this.entryIdMap.has(entry.path)) continue;
      const id = nextId++;
      this.entryStore.push(entry);
      this.entryIdMap.set(entry.path, id);
    }

    // 2. 构建 Prefix Trie + Trigram Index + 拼音
    for (let i = 0; i < this.entryStore.length; i++) {
      const entry = this.entryStore[i];
      const name = entry.name.toLowerCase();

      // 收集所有搜索 key
      const keys: string[] = [name];

      // 拼音扩展
      if (/[一-鿿]/.test(name)) {
        const full = pinyin(name, { toneType: 'none' }).toLowerCase().replace(/\s+/g, '');
        const lettersOnly = full.replace(/[^a-z]/g, '');
        const initials = pinyin(name, { pattern: 'first', toneType: 'none' })
          .toLowerCase()
          .replace(/\s+/g, '');

        keys.push(full); // 全拼
        keys.push(lettersOnly); // 纯字母
        keys.push(initials); // 首字母
        this.pinyinData.set(i, { full, initials });
      }

      // 插入 Prefix Trie
      for (const key of keys) {
        this.insertTrie(key, i);
      }

      // 插入 Trigram Index（原始名 + 拼音变体）
      this.insertTrigrams(name, i);
      const phonetic = this.pinyinData.get(i);
      if (phonetic) {
        this.insertTrigrams(phonetic.full, i);
        this.insertTrigrams(phonetic.initials, i);
      }
    }

    this._ready = true;
  }

  /** 搜索入口：自动选择最优策略 */
  search(query: string, maxResults = 50): FileEntry[] {
    if (!query || !this._ready) return [];
    const q = query.toLowerCase().trim();

    // 通配符 → 正则匹配全量
    if (q.includes('*') || q.includes('?')) {
      return this.wildcardSearch(q, maxResults);
    }

    // 策略 1：短查询 → Prefix Trie，无结果则 fallback trigram
    if (q.length <= 3) {
      const prefixResults = this.prefixSearch(q, maxResults);
      if (prefixResults.length > 0) return prefixResults;
      return this.trigramSearch(q, maxResults);
    }

    // 策略 2：长查询 → Trigram Index
    return this.trigramSearch(q, maxResults);
  }

  clear(): void {
    this.trieRoot = { children: new Map(), entries: [] };
    this.trigramIndex.clear();
    this.entryStore = [];
    this.entryIdMap.clear();
    this.pinyinData.clear();
    this._ready = false;
  }

  // ── Prefix Trie ──────────────────────────────

  private insertTrie(key: string, entryId: number): void {
    let node = this.trieRoot;
    for (const ch of key) {
      if (!node.children.has(ch)) {
        node.children.set(ch, { children: new Map(), entries: [] });
      }
      node = node.children.get(ch)!;
    }
    if (!node.entries.includes(this.entryStore[entryId])) {
      node.entries.push(this.entryStore[entryId]);
    }
  }

  private prefixSearch(prefix: string, max: number): FileEntry[] {
    let node: TrieNode | undefined = this.trieRoot;
    for (const ch of prefix) {
      node = node?.children.get(ch);
      if (!node) return [];
    }

    const candidates: FileEntry[] = [];
    this.collectTrie(node, candidates, max);
    // 再按前缀长度排序，精确前缀靠前
    return candidates
      .sort((a, b) => {
        const aIdx = a.name.toLowerCase().indexOf(prefix);
        const bIdx = b.name.toLowerCase().indexOf(prefix);
        return aIdx - bIdx;
      })
      .slice(0, max);
  }

  private collectTrie(node: TrieNode, result: FileEntry[], max: number): void {
    if (result.length >= max) return;
    for (const e of node.entries) {
      if (result.length >= max) return;
      if (!result.includes(e)) result.push(e);
    }
    for (const [, child] of node.children) {
      this.collectTrie(child, result, max);
    }
  }

  // ── Trigram 倒排索引 ──────────────────────────

  private insertTrigrams(name: string, entryId: number): void {
    const trigrams = this.makeNgrams(name, 3);
    for (const tri of trigrams) {
      if (!this.trigramIndex.has(tri)) {
        this.trigramIndex.set(tri, new Set());
      }
      this.trigramIndex.get(tri)!.add(entryId);
    }
  }

  /** 生成 n-gram 集合 */
  private makeNgrams(text: string, n: number): string[] {
    if (text.length < n) return [text];
    const result: string[] = [];
    for (let i = 0; i <= text.length - n; i++) {
      result.push(text.slice(i, i + n));
    }
    return result;
  }

  /**
   * Trigram 搜索：
   * 1. 提取 query 的 trigrams
   * 2. 对每个 trigram 查倒排索引
   * 3. 取交集（必须包含所有 trigram）
   * 4. 按重叠度排序返回
   */
  private trigramSearch(query: string, max: number): FileEntry[] {
    const trigrams = this.makeNgrams(query, 3);

    // 查每个 trigram 的倒排列表
    const postings: Set<number>[] = [];
    for (const tri of trigrams) {
      const posting = this.trigramIndex.get(tri);
      if (!posting) {
        // 任一片段缺失都不可能是完整子串，转入拼音回退检查。
        return this.fallbackSubstring(query, max);
      }
      postings.push(posting);
    }

    // 取交集
    const [first, ...rest] = postings;
    let intersection = new Set(first);
    for (const posting of rest) {
      intersection = new Set([...intersection].filter((id) => posting.has(id)));
    }

    if (intersection.size === 0) {
      return this.fallbackSubstring(query, max);
    }

    // 按 trigram 命中数量排序（重叠度越高越相关）
    const scored = [...intersection].map((id) => {
      const name = this.entryStore[id].name.toLowerCase();
      const phonetic = this.pinyinData.get(id);
      let overlap = 0;
      for (const tri of trigrams) {
        if (name.includes(tri)) overlap++;
        else if (
          phonetic &&
          (phonetic.full.includes(tri) || phonetic.initials.includes(tri))
        ) {
          overlap++;
        }
      }
      return { id, overlap };
    });

    scored.sort((a, b) => b.overlap - a.overlap);

    return scored
      .slice(0, max)
      .map((s) => this.entryStore[s.id])
      .filter(Boolean);
  }

  /** 通配符搜索：将 * → .*?  ? → .  转为正则，遍历全量匹配 */
  private wildcardSearch(query: string, max: number): FileEntry[] {
    const escaped = query.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const glob = escaped.replace(/\*/g, '.*?').replace(/\?/g, '.');
    const regex = new RegExp(glob, 'i');

    const result: FileEntry[] = [];
    for (const entry of this.entryStore) {
      if (result.length >= max) break;
      if (regex.test(entry.name)) {
        result.push(entry);
      }
    }
    return result;
  }

  /** 回退：全量子串匹配（含拼音） */
  private fallbackSubstring(query: string, max: number): FileEntry[] {
    const result: FileEntry[] = [];
    const lower = query;
    const isAsciiQuery = /^[a-z0-9]+$/.test(lower);

    for (let id = 0; id < this.entryStore.length; id++) {
      if (result.length >= max) break;
      const entry = this.entryStore[id];
      if (entry.name.toLowerCase().includes(lower)) {
        result.push(entry);
        continue;
      }

      const phonetic = isAsciiQuery ? this.pinyinData.get(id) : undefined;
      if (
        phonetic &&
        (phonetic.full.includes(lower) || phonetic.initials.includes(lower))
      ) {
        result.push(entry);
      }
    }
    return result;
  }
}
