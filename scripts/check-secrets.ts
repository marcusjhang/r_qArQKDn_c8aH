/**
 * Secret scanner — a lightweight guard against committing plain-text
 * credentials. Scans git-tracked text files (or, with --staged, only the files
 * staged for commit) for patterns that look like real secrets and exits
 * non-zero when it finds one.
 *
 *   bun run audit:secrets            # scan all tracked files
 *   bun run audit:secrets --staged   # scan staged changes only (pre-commit)
 *
 * This is a speed bump, not a vault. It deliberately errs toward a few targeted,
 * high-signal patterns (assigned secrets with real-looking values, private-key
 * blocks, provider tokens) to stay false-positive-free on this repo. Broaden the
 * RULES list as new secret shapes appear.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

type Rule = { name: string; re: RegExp };

// Each rule matches a line that carries an actual secret value — not an empty
// placeholder (`AUTH_SECRET=`) or a reference (`process.env.AUTH_SECRET`).
const RULES: Rule[] = [
  {
    name: 'Private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/
  },
  {
    name: 'Postgres/MySQL connection string with credentials',
    re: /\b(?:postgres|postgresql|mysql):\/\/[^\s:'"<>]+:[^\s@'"<>]+@/i
  },
  {
    name: 'AWS access key id',
    re: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    name: 'GitHub token',
    re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/
  },
  {
    name: 'Assigned secret/token/password with a non-placeholder value',
    // KEY = 'value' where KEY looks secret and value is a real-ish literal
    // (>= 8 chars, not an obvious placeholder or an env-var reference).
    re: /\b(?:AUTH_SECRET|[A-Z0-9_]*(?:SECRET|PASSWORD|API[_-]?KEY|ACCESS[_-]?TOKEN|PRIVATE[_-]?KEY))\b\s*[:=]\s*['"]?(?!process\.env|import\.meta|<|\$\{|your[_-]|xxx|placeholder|changeme|example)[^\s'"]{8,}/i
  }
];

// Never scan these — lockfiles, this scanner, and the placeholder env template.
const IGNORE = [
  /(^|\/)bun\.lock$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)\.env\.example$/,
  /(^|\/)scripts\/check-secrets\.ts$/
];

const MAX_BYTES = 1_000_000; // skip anything bigger than ~1MB (likely binary/asset)

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function trackedFiles(stagedOnly: boolean): string[] {
  const out = stagedOnly
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
    : git(['ls-files']);
  return out
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => !IGNORE.some((re) => re.test(f)));
}

function looksBinary(buf: Buffer): boolean {
  // A NUL byte in the first chunk is a reliable binary signal.
  return buf.subarray(0, 8000).includes(0);
}

function main() {
  const stagedOnly = process.argv.includes('--staged');
  const files = trackedFiles(stagedOnly);

  const findings: string[] = [];
  for (const file of files) {
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      continue; // deleted between listing and read
    }
    if (size > MAX_BYTES) continue;

    const buf = readFileSync(file);
    if (looksBinary(buf)) continue;

    const lines = buf.toString('utf8').split('\n');
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          findings.push(`  ${file}:${i + 1}  [${rule.name}]`);
          break; // one finding per line is enough
        }
      }
    });
  }

  if (findings.length > 0) {
    console.error(
      `\n✖ Potential secret(s) found in ${
        stagedOnly ? 'staged' : 'tracked'
      } files:\n`
    );
    console.error(findings.join('\n'));
    console.error(
      '\nMove secrets to an untracked .env file (see .env.example). ' +
        'If this is a false positive, tighten the rule or add the path to ' +
        'IGNORE in scripts/check-secrets.ts.\n'
    );
    process.exit(1);
  }

  console.log(
    `✓ No secrets detected in ${files.length} ${
      stagedOnly ? 'staged' : 'tracked'
    } file(s).`
  );
}

main();
