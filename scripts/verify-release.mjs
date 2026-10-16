import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyReleaseTag(tag, versions) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag ?? ''))
    throw new Error('Use an existing vMAJOR.MINOR.PATCH tag');
  if (versions.some((version) => `v${version}` !== tag))
    throw new Error('Release tag must match all three package versions');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tag = process.env.RELEASE_TAG || process.argv[2];
  const manifests = ['package.json', 'apps/desktop/package.json', 'packages/shared/package.json'].map(
    (file) => JSON.parse(readFileSync(file, 'utf8')),
  );
  verifyReleaseTag(
    tag,
    manifests.map((manifest) => manifest.version),
  );
  if (manifests.some((manifest) => manifest.license !== 'MIT'))
    throw new Error('Package licenses must remain MIT');
  console.log(`Release tag and package metadata verified: ${tag}`);
}
