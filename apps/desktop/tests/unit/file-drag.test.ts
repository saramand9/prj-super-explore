import { describe, expect, it } from 'vitest';
import { getFileDropEffect } from '../../src/renderer/plugins/file-explorer/utils/file-drag';

describe('file drag intent', () => {
  it.each([
    [{ shiftKey: false, ctrlKey: false }, 'copy'],
    [{ shiftKey: false, ctrlKey: true }, 'copy'],
    [{ shiftKey: false, ctrlKey: false, metaKey: true }, 'copy'],
    [{ shiftKey: true, ctrlKey: false }, 'move'],
    [{ shiftKey: true, ctrlKey: true }, 'copy'],
    [{ shiftKey: true, ctrlKey: false, metaKey: true }, 'copy'],
    [{ shiftKey: true, ctrlKey: true, metaKey: true }, 'copy'],
  ] as const)('resolves %j to %s', (modifiers, expected) => {
    expect(getFileDropEffect(modifiers)).toBe(expected);
  });
});
