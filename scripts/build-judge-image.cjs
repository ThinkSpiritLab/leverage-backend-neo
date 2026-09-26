// Build the judge image without sending the repository or its secrets to Docker.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const context = fs.mkdtempSync(path.join(os.tmpdir(), 'leverage-judge-context-'));
try {
  execFileSync('docker', [
    'build', '-t', process.env.JUDGE_IMAGE || 'leverage-judge-runtime:local',
    '-f', path.resolve(__dirname, '../deploy/judge-runtime.Dockerfile'), context,
  ], { stdio: 'inherit', timeout: 300_000 });
} finally {
  fs.rmSync(context, { recursive: true, force: true });
}
