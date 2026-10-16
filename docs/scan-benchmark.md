# Directory scanning and filename-index benchmark

Run `pnpm benchmark:scan` explicitly. The benchmark creates real temporary
10,000- and 100,000-file fixtures, with 1,000 empty files per directory and
Chinese names for 10% of files. It cleans up fixtures after each run and performs
substantial disk writes.

## Recorded results

These are the existing measurements recorded on September 22, 2026, not a new
benchmark run: Windows x64, Intel Core i5-14400, Node.js 24.19.0.

| Measurement | 10,000 files | 100,000 files |
| --- | ---: | ---: |
| Entries including subdirectories | 10,010 | 100,100 |
| First batch received | 7 ms | 6 ms |
| Traversal and incremental indexing | 291 ms | 3,252 ms |
| Maximum single-batch indexing time | 5.10 ms | 8.75 ms |
| Maximum of five query times | 0.43 ms | 0.23 ms |
| Cancellation to traversal return after first batch | 0.65 ms | 0.29 ms |
| Node heap used during measurement | 69 MiB | 346 MiB |

Queries cover ordinary prefixes, pinyin initials, Chinese names, exact filenames
and wildcards, returning at most 50 entries. The benchmark also checks scan and
index counts, query hits and cancellation. The engine starts with the smallest
posting set and retains only the best requested matches instead of copying and
sorting all candidates.

## Interpretation and limits

This measures the engine: scan callbacks synchronously append to the index.
The production interface sends batches over IPC to a separate worker with
batch acknowledgements. These measurements exclude IPC, worker startup,
rendering and window operations.

Files were newly created and in a warm local cache. Each value is from one
recorded run, not a cold-disk, network-share or arbitrary-hardware guarantee.

Heap usage is the entire Vitest process's `heapUsed`, without forced garbage
collection. It includes the runner and potentially uncollected objects, not just
the retained index or total application memory. The 100,000-entry case has a
material memory cost; the application caps scans at 200,000 entries.

Cancellation is checked between batches and file operations. A blocked
filesystem call means these results cannot establish cancellation latency on a
disconnected share. Electron end-to-end tests separately cover querying while
scanning, stopping without losing results and rescanning. Unit tests cover
junction loops, unreadable child directories and scan limits.
