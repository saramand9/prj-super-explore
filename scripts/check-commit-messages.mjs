import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SUBJECT =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9][a-z0-9-]*\))?!?: (\S.*)$/;

export function validateMessage(message) {
  const normalized = message.replace(/\r\n/g, '\n').trimEnd();
  const [subject = '', ...body] = normalized.split('\n');
  const errors = [];
  if (!SUBJECT.test(subject))
    errors.push('Use type(scope): imperative summary with a supported Conventional Commit type.');
  if (subject.length > 72) errors.push('Keep the subject at or below 72 characters.');
  if (subject.endsWith('.')) errors.push('Do not end the subject with a full stop.');
  if (/[^\x09\x0a\x20-\x7e]/.test(normalized))
    errors.push('Write an English ASCII subject and body; romanize non-English examples.');
  if (body.length && body[0] !== '') errors.push('Separate the subject and body with a blank line.');
  if (/^[^\n]*!:/m.test(subject) && !/^BREAKING CHANGE: \S/m.test(normalized)) {
    errors.push('Document the incompatible change in a BREAKING CHANGE: footer.');
  }
  return errors;
}

function main(args) {
  const mode = args[0];
  const failures = [];
  let count = 0;
  function check(label, message) {
    count += 1;
    for (const error of validateMessage(message)) failures.push(`${label}: ${error}`);
  }
  if (mode === '--file' && args.length === 2) {
    // Match Git's default comment cleanup without removing # inside a subject.
    const message = readFileSync(args[1], 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.startsWith('#'))
      .join('\n');
    check('commit message', message);
  } else if (mode === '--ref' && args.length === 2) {
    const commits = execFileSync('git', ['rev-list', args[1], '--'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    if (!commits.length) throw new Error('The selected ref has no commits.');
    for (const commit of commits) {
      check(
        commit.slice(0, 12),
        execFileSync('git', ['show', '-s', '--format=%B', commit, '--'], { encoding: 'utf8' }),
      );
    }
  } else if (mode === '--pr-title' && args.length === 1) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    check('pull request title', event.pull_request?.title ?? '');
  } else {
    throw new Error('Usage: node scripts/check-commit-messages.mjs --file PATH | --ref REF | --pr-title');
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Commit policy passed for ${count} message(s).`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
