import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReleaseTag } from '../verify-release.mjs';
import { readFileSync } from 'node:fs';

test('release tag must match every package, including prereleases', () => {
  assert.doesNotThrow(() => verifyReleaseTag('v1.2.3', ['1.2.3', '1.2.3', '1.2.3']));
  assert.doesNotThrow(() => verifyReleaseTag('v1.2.3-rc.1', ['1.2.3-rc.1']));
  for (const tag of ['master', 'v1.2', 'v1.2.3; echo injected', undefined])
    assert.throws(() => verifyReleaseTag(tag, ['1.2.3']));
  assert.throws(() => verifyReleaseTag('v1.2.3', ['1.2.3', '1.2.4']));
});

test('Windows packaging runs the application script rather than pnpm pack', () => {
  const root = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(root.scripts['pack:win'], 'pnpm --filter @explore/desktop run pack');
});
