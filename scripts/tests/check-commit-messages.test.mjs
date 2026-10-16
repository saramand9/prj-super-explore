import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMessage } from '../check-commit-messages.mjs';

test('accepts English Conventional Commits with optional scope and body', () => {
  for (const message of ['fix(search): match long pinyin queries\n', 'docs: explain Windows setup\n\nKeep instructions reproducible.\n', 'chore(history): merge upstream changes and retain pinyin fixes']) {
    assert.deepEqual(validateMessage(message), []);
  }
});
test('accepts an explicit breaking-change explanation', () => {
  assert.deepEqual(validateMessage('feat(ipc)!: require operation IDs\n\nBREAKING CHANGE: callers must provide an operation ID.'), []);
});
test('rejects unstructured, debug and non-English messages', () => {
  for (const message of ['update', 'Merge branch master', 'debug: add logs', 'fix: \u4fee\u590d\u641c\u7d22', 'fix: repair search\n\n\u4fee\u590d']) {
    assert.ok(validateMessage(message).length, message);
  }
});
test('rejects overlong subjects, trailing periods and missing blank lines', () => {
  for (const message of ['fix: ' + 'a'.repeat(70), 'fix: repair search.', 'fix: repair search\nBody without a separator']) {
    assert.ok(validateMessage(message).length, message);
  }
});
test('normalizes CRLF and requires a breaking-change footer for !', () => {
  assert.deepEqual(validateMessage('fix: repair search\r\n\r\nExplain the reason.\r\n'), []);
  assert.ok(validateMessage('feat!: change IPC').length);
});
