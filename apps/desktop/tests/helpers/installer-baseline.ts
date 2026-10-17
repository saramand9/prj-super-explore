type PublishedBaseline = { version: string; size: number; sha256: string };
type InstallerBaseline =
  | { mode: 'reinstall'; version: string }
  | ({ mode: 'upgrade'; url: string } & PublishedBaseline);

// The initial public release has no older retained installer. Before releasing
// a later version, pin the downloaded 1.0.0 installer size and SHA-256 here.
const INITIAL_BASELINE: PublishedBaseline = { version: '1.0.0', size: 0, sha256: '' };

export function selectInstallerBaseline(
  version: string,
  baseline: PublishedBaseline = INITIAL_BASELINE,
): InstallerBaseline {
  const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (!stable.test(version) || !stable.test(baseline.version)) throw new Error('Invalid stable version');
  if (version === '1.0.0' && baseline.version === version) return { mode: 'reinstall', version };
  const current = version.split('.').map(Number);
  const previous = baseline.version.split('.').map(Number);
  const difference = current.findIndex((value, index) => value !== previous[index]);
  if (difference < 0 || current[difference] < previous[difference])
    throw new Error('Installer baseline must precede the release');
  if (!Number.isSafeInteger(baseline.size) || baseline.size <= 0 || !/^[a-f0-9]{64}$/.test(baseline.sha256))
    throw new Error('Pin the published 1.0.0 installer size and SHA-256 before a later release');
  return {
    mode: 'upgrade',
    ...baseline,
    url: `https://github.com/saramand9/prj-super-explore/releases/download/v${baseline.version}/Explore-Setup-${baseline.version}-windows-x64.exe`,
  };
}
