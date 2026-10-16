export function isTrustedRendererUrl(candidate: string, entry: string): boolean {
  try {
    const url = new URL(candidate),
      expected = new URL(entry);
    url.hash = '';
    expected.hash = '';
    return ['file:', 'http:', 'https:'].includes(expected.protocol) && url.href === expected.href;
  } catch {
    return false; /* Malformed and blank frame URLs are never trusted. */
  }
}
