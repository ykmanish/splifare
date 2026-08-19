const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Which build of Splitta this server is running.
 *
 * The point is a value that changes when — and only when — something was
 * actually deployed. A restart on its own must not change it, or a crash-loop
 * would tell everyone there is a new version every few seconds.
 *
 * The deploy is `git fetch` + `git reset --hard origin/main`, so the commit
 * on disk is exactly that: it moves on a deploy and survives a restart. An
 * explicit `BUILD_ID` still wins, for a deploy that ships without a checkout.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');

function fromGit() {
  try {
    // Only if a checkout is actually here — a tarball deploy has no .git and
    // shelling out would just throw on every boot.
    if (!fs.existsSync(path.join(ROOT, '.git'))) return '';
    const sha = execFileSync('git', ['rev-parse', '--short=10', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{7,40}$/.test(sha) ? sha : '';
  } catch {
    return '';
  }
}

function fromPackage() {
  try {
    // eslint-disable-next-line global-require
    return String(require(path.join(ROOT, 'backend', 'package.json')).version || '');
  } catch {
    return '';
  }
}

/** Resolved once at startup: it describes the code, which cannot change while running. */
const BUILD = process.env.BUILD_ID || fromGit() || fromPackage() || 'dev';

/** When this process came up — for diagnostics, never for update detection. */
const STARTED_AT = new Date().toISOString();

module.exports = { BUILD, STARTED_AT };
