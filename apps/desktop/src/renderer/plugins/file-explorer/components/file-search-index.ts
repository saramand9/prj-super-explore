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
  private searchKeys: string[][] = [];

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
    this.append(entries);
  }

  /** Append a scan batch without rebuilding or duplicating the existing index. */
  append(entries: FileEntry[]): void {
    for (const entry of entries) {
      if (this.entryIdMap.has(entry.path)) continue;
      const i = this.entryStore.length;
      this.entryStore.push(entry);
      this.entryIdMap.set(entry.path, i);
      const name = entry.name.toLowerCase();

      // 收集所有搜索 key，并去掉中文名与拼音转换产生的重复项。
      const keys = new Set<string>([name]);

      // 拼音扩展
      if (/[一-鿿]/.test(name)) {
        const fullPinyin = pinyin(name, { toneType: 'none', type: 'array', v: true })
          .join('')
          .toLowerCase();
        const initials = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' })
          .join('')
          .toLowerCase();
        if (fullPinyin) keys.add(fullPinyin);
        if (initials) keys.add(initials);
      }

      const entryKeys = [...keys];
      this.searchKeys[i] = entryKeys;

      // 插入 Prefix Trie
      for (const key of entryKeys) {
        this.insertTrie(key, i);
        this.insertTrigrams(key, i);
      }
    }

    this._ready = true;
  }

  /** 搜索入口：自动选择最优策略 */
  search(query: string, maxResults = 50): FileEntry[] {
    if (!query || !this._ready) return [];
    const q = query.toLowerCase().trim();
    if (!q || maxResults <= 0) return [];

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
    this.searchKeys = [];
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
    const postings = trigrams.map((tri) => this.trigramIndex.get(tri));

    if (postings.some((posting) => !posting)) {
      // 任一片段缺失都不可能完整命中，回退处理短文本等未建索引情况。
      return this.fallbackSubstring(query, max);
    }

    // Begin with the rarest fragment and keep only the requested best matches.
    // Broad prefixes must not allocate/sort all 100k matching entries on each keystroke.
    const [first, ...rest] = (postings as Set<number>[]).sort((a, b) => a.size - b.size);
    const scored: { id: number; position: number }[] = [];
    for (const id of first) {
      if (!rest.every((posting) => posting.has(id))) continue;
      let position = Infinity;
      for (const key of this.searchKeys[id]) {
        const found = key.indexOf(query);
        if (found >= 0) position = Math.min(position, found);
      }
      if (!Number.isFinite(position)) continue;
      const insertAt = scored.findIndex((item) => item.position > position);
      if (insertAt >= 0) scored.splice(insertAt, 0, { id, position });
      else if (scored.length < max) scored.push({ id, position });
      if (scored.length > max) scored.pop();
      // Posting sets retain entry order, so no later candidate can improve tied prefix matches.
      if (scored.length === max && scored[max - 1].position === 0) break;
    }
    return scored.map(({ id }) => this.entryStore[id]);
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

  /** 回退：全量子串匹配 */
  private fallbackSubstring(query: string, max: number): FileEntry[] {
    const result: FileEntry[] = [];
    for (let id = 0; id < this.entryStore.length; id++) {
      if (result.length >= max) break;
      if (this.searchKeys[id].some((key) => key.includes(query))) {
        result.push(this.entryStore[id]);
      }
    }
    return result;
  }
}
