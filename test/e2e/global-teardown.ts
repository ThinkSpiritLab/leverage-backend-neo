/**
 * Jest globalTeardown — stops containers after all test files finish.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CONTAINER_INFO_FILE = path.join(__dirname, '.container-info.json');

export default async function globalTeardown() {
  if (!fs.existsSync(CONTAINER_INFO_FILE)) {
    return;
  }

  const info = JSON.parse(fs.readFileSync(CONTAINER_INFO_FILE, 'utf8'));
  console.log('\n🛑 Stopping testcontainers...');

  try {
    execSync(`docker stop ${info.mariadbId} ${info.redisId}`, {
      stdio: 'ignore',
    });
    execSync(`docker rm -f ${info.mariadbId} ${info.redisId}`, {
      stdio: 'ignore',
    });
    console.log('✅ Containers stopped and removed.');
  } catch {
    // Ryuk container (testcontainers cleanup daemon) handles orphan cleanup automatically
    console.log('ℹ️  Containers may already be cleaned up by Ryuk.');
  } finally {
    fs.unlinkSync(CONTAINER_INFO_FILE);
  }
}
