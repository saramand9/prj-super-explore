export function isTrustedRendererUrl(candidate: string, entry: string): boolean {
  try {
    const url = new URL(candidate),
      expected = new URL(entry);
    url.hash = '';
    expected.hash = '';
    if (!['file:', 'http:', 'https:'].includes(expected.protocol)) return false;
    if (url.href === expected.href) return true;
    if (
      url.protocol !== 'file:' ||
      expected.protocol !== 'file:' ||
      url.search !== expected.search ||
      url.host !== expected.host
    )
      return false;
    // Windows can spell the same installation path using a long name, 8.3
    // alias or junction. Trust only the same canonical file, never its parent.
    const actualFile = realpathSync(fileURLToPath(url));
    const expectedFile = realpathSync(fileURLToPath(expected));
    return actualFile === expectedFile;
  } catch {
    return false; /* Malformed and blank frame URLs are never trusted. */
  }
}
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
