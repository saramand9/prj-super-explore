import type { FileEntry } from '@explore/shared';
import { FileSearchIndex } from './file-search-index';

const index = new FileSearchIndex();
let query = '';
self.onmessage = (event: MessageEvent<{ type: 'append'; entries: FileEntry[] } | { type: 'query'; query: string }>) => {
  if (event.data.type === 'append') index.append(event.data.entries);
  else query = event.data.query;
  self.postMessage({ type: event.data.type, count: index.entryCount, query, results: index.search(query, 50) });
};
