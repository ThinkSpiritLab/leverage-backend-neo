import 'reflect-metadata';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import mysql from 'mysql2/promise';
import { InitialSchema1000000000000 } from '../src/migrations/1000000000000-InitialSchema';
import { AddExternalJudgeColumns1000000000001 } from '../src/migrations/1000000000001-AddExternalJudgeColumns';
import { AddCompeteColumns1000000000002 } from '../src/migrations/1000000000002-AddCompeteColumns';
import { AddGameRendererHtml1000000000003 } from '../src/migrations/1000000000003-AddGameRendererHtml';
import { CompleteEntitySchema1000000000004 } from '../src/migrations/1000000000004-CompleteEntitySchema';
import { UserApiKey } from '../src/database/entities/user-api-key.entity';

const container = `leverage-migration-${process.pid}`;
const root = process.env.TEST_TMPDIR ?? tmpdir();
mkdirSync(root, { recursive: true });
const dataDir = mkdtempSync(join(root, 'leverage-mariadb-'));
const password = `Tmp-${process.pid}-migration-only`;
const dbNames = ['migration_empty', 'migration_upgrade'];
const migrations = [
  InitialSchema1000000000000,
  AddExternalJudgeColumns1000000000001,
  AddCompeteColumns1000000000002,
  AddGameRendererHtml1000000000003,
  CompleteEntitySchema1000000000004,
];

function run(command: string, args: string[], capture = false): string {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`,
    );
  }
  return capture ? result.stdout.trim() : '';
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function source(database: string, migrationList = migrations): DataSource {
  return new DataSource({
    type: 'mysql',
    host: '127.0.0.1',
    port: Number(process.env.MIGRATION_CHECK_PORT),
    username: 'root',
    password,
    database,
    entities: ['src/**/*.entity.ts'],
    migrations: migrationList,
    migrationsTableName: 'migrations',
    logging: ['error'],
  });
}

async function waitForMariaDb(port: number): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      execFileSync(
        'docker',
        [
          'exec',
          container,
          'mariadb-admin',
          'ping',
          '-uroot',
          `-p${password}`,
          '--silent',
        ],
        { stdio: 'ignore' },
      );
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        password,
        connectTimeout: 1000,
      });
      await connection.end();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('MariaDB did not become reachable within 90 seconds');
}

async function verifyRequiredObjects(
  ds: DataSource,
  label: string,
): Promise<void> {
  const checks: Record<string, string[]> = {
    game: ['allowHuman', 'autoMatchEnabled', 'rendererHtml'],
    gamer: [
      'disabled',
      'elo',
      'eloExternal',
      'type',
      'botApiKey',
      'botApiKeyExpiresAt',
      'webhookUrl',
      'webhookSecret',
      'isTest',
    ],
    match: ['externalJobId', 'isTest'],
    match_gamer_link: ['won'],
    problem: ['checkerCode', 'checkerLanguage'],
    submission: [
      'provider',
      'externalJobId',
      'providerMeta',
      'judgeAttempt',
      'judgedStatus',
    ],
    user_api_key: [
      'userId',
      'name',
      'keyPrefix',
      'keyHash',
      'createdAt',
      'revokedAt',
      'lastUsedAt',
    ],
    gamer_elo_history: [
      'gamerId',
      'matchId',
      'eloBefore',
      'eloAfter',
      'eloDelta',
      'createdAt',
    ],
  };
  for (const [table, columns] of Object.entries(checks)) {
    assert(
      await ds
        .query(
          'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
          [table],
        )
        .then((rows) => rows.length === 1),
      `${label}: table ${table} exists`,
    );
    const actual = await ds.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
      [table],
    );
    const actualNames = new Set(
      actual.map(
        (r: { COLUMN_NAME?: string; column_name?: string }) =>
          r.COLUMN_NAME ?? r.column_name,
      ),
    );
    for (const column of columns)
      assert(actualNames.has(column), `${label}: ${table}.${column} exists`);
  }
  for (const metadata of ds.entityMetadatas) {
    const rows = await ds.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?',
      [metadata.tableName],
    );
    const actual = new Set(
      rows.map(
        (r: { COLUMN_NAME?: string; column_name?: string }) =>
          r.COLUMN_NAME ?? r.column_name,
      ),
    );
    const missing = metadata.columns
      .map((column) => column.databaseName)
      .filter((name) => !actual.has(name));
    assert(
      missing.length === 0,
      `${label}: ${metadata.tableName} metadata columns missing: ${missing.join(', ')}`,
    );
  }
  console.log(
    `SQL ${label}: all ${ds.entityMetadatas.length} registered entity column sets exist`,
  );
}

async function verifyRuntimePaths(
  ds: DataSource,
  label: string,
): Promise<void> {
  await ds.query('INSERT INTO `user` (username, password) VALUES (?, ?)', [
    `migration-${label}`,
    'local-test-only',
  ]);
  const [{ id: userId }] = await ds.query(
    'SELECT id FROM `user` WHERE username = ?',
    [`migration-${label}`],
  );
  const apiKeys = ds.getRepository(UserApiKey);
  const apiKey = await apiKeys.save(
    apiKeys.create({
      userId,
      name: 'test',
      keyPrefix: 'prefix',
      keyHash: `${label}-hash`,
      revokedAt: null,
      lastUsedAt: null,
    }),
  );
  const fetched = await apiKeys.findOneByOrFail({ id: apiKey.id });
  assert(
    fetched.keyHash === `${label}-hash`,
    `${label}: UserApiKey ORM insert/select`,
  );
  await ds.query(
    'INSERT INTO `gamer_elo_history` (gamerId, matchId, eloBefore, eloAfter, eloDelta) VALUES (1, 2, 1200, 1216, 16)',
  );
  const [history] = await ds.query(
    'SELECT matchId, eloBefore, eloAfter, eloDelta FROM gamer_elo_history WHERE gamerId = 1 ORDER BY createdAt DESC LIMIT 1',
  );
  assert(
    history.matchId === 2 && history.eloAfter === 1216,
    `${label}: native ELO history insert/select`,
  );
  await ds.query(
    'INSERT INTO `game` (title, description, timeLimit, memoryLimit, judgerCode, judgerLanguage, allowHuman, autoMatchEnabled) VALUES (?, ?, 1, 64, ?, ?, 1, 1)',
    ['test', '', '', 'cpp'],
  );
  const [game] = await ds.query(
    'SELECT allowHuman, autoMatchEnabled FROM game WHERE title = ?',
    ['test'],
  );
  assert(
    Number(game.allowHuman) === 1 && Number(game.autoMatchEnabled) === 1,
    `${label}: game capability SQL`,
  );
  console.log(
    `SQL ${label}: API-key ORM and game/ELO raw SQL insert-select paths passed`,
  );
}

async function main(): Promise<void> {
  try {
    execFileSync('docker', ['inspect', container], { stdio: 'ignore' });
    throw new Error(
      `Refusing to use pre-existing container ${container}; inspect/remove it explicitly first.`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Refusing'))
      throw error;
  }

  mkdirSync(dataDir, { recursive: true });
  try {
    run('docker', [
      'run',
      '--name',
      container,
      '-d',
      '-e',
      `MARIADB_ROOT_PASSWORD=${password}`,
      '-e',
      'MARIADB_DATABASE=bootstrap',
      '-p',
      '127.0.0.1::3306',
      '-v',
      `${dataDir}:/var/lib/mysql`,
      'mariadb:10.11',
    ]);
    const portMap = execFileSync('docker', ['port', container, '3306/tcp'], {
      encoding: 'utf8',
    }).trim();
    const port = portMap.split(':').pop();
    assert(port, 'Docker assigned a host port');
    process.env.MIGRATION_CHECK_PORT = port;
    await waitForMariaDb(Number(port));
    console.log(
      `MariaDB: mariadb:10.11 container=${container} host=127.0.0.1 port=${port}`,
    );

    const admin = await mysql.createConnection({
      host: '127.0.0.1',
      port: Number(port),
      user: 'root',
      password,
    });
    for (const db of dbNames)
      await admin.query(
        `CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );

    // Empty database: the complete migration chain from the original schema.
    const empty = source(dbNames[0]);
    await empty.initialize();
    const appliedEmpty = await empty.runMigrations({ transaction: 'each' });
    console.log(
      `SQL empty: migrations applied=${appliedEmpty.map((m) => m.name).join(',')}`,
    );
    await verifyRequiredObjects(empty, 'empty');
    await verifyRuntimePaths(empty, 'empty');
    await empty.destroy();

    // Old schema upgrade: apply only the four pre-existing migrations and
    // emulate a development synchronize that already created a few columns.
    const upgradeOld = source(dbNames[1], migrations.slice(0, 4));
    await upgradeOld.initialize();
    await upgradeOld.runMigrations({ transaction: 'each' });
    await upgradeOld.query(
      "ALTER TABLE `game` ADD COLUMN `allowHuman` tinyint(1) NOT NULL DEFAULT '0'",
    );
    await upgradeOld.query(
      'ALTER TABLE `gamer` ADD COLUMN `eloExternal` int NOT NULL DEFAULT 1200',
    );
    await upgradeOld.query(
      'ALTER TABLE `submission` ADD COLUMN `judgeAttempt` varchar(32) NULL DEFAULT NULL',
    );
    await upgradeOld.query(
      'ALTER TABLE `submission` ADD COLUMN `judgedStatus` int NULL DEFAULT NULL',
    );
    await upgradeOld.query(
      'ALTER TABLE `user` ADD COLUMN `email` varchar(100) NULL DEFAULT NULL',
    );

    await upgradeOld.query(
      "INSERT INTO `user` (username, password) VALUES ('old-user', 'local-test-only')",
    );
    await upgradeOld.query(
      "INSERT INTO `problem` (prefix, logicId, title, content, source, timeLimit, memoryLimit) VALUES ('p', 9001, 'old-problem', '', '', 1, 64)",
    );
    const [{ id: oldUserId }] = await upgradeOld.query(
      "SELECT id FROM `user` WHERE username='old-user'",
    );
    const [{ id: oldProblemId }] = await upgradeOld.query(
      'SELECT id FROM `problem` WHERE logicId=9001',
    );
    for (const status of [1, 4, 9, 10, 11, null]) {
      await upgradeOld.query(
        'INSERT INTO `submission` (userId, problemId, language, status) VALUES (?, ?, 1, ?)',
        [oldUserId, oldProblemId, status],
      );
    }
    await upgradeOld.destroy();

    const upgrade = source(dbNames[1]);
    await upgrade.initialize();
    const appliedUpgrade = await upgrade.runMigrations({ transaction: 'each' });
    console.log(
      `SQL upgrade: migrations applied=${appliedUpgrade.map((m) => m.name).join(',')}`,
    );
    await verifyRequiredObjects(upgrade, 'upgrade');
    const backfill = await upgrade.query(
      'SELECT status, judgedStatus FROM submission ORDER BY id',
    );
    assert(
      backfill.length === 6,
      'upgrade: all six legacy submissions retained',
    );
    for (const row of backfill) {
      const status = row.status === null ? null : Number(row.status);
      const judgedStatus =
        row.judgedStatus === null ? null : Number(row.judgedStatus);
      assert(
        judgedStatus ===
          ([9, 10, 11].includes(status as number) || status === null
            ? null
            : status),
        `upgrade: status ${status} backfilled as ${judgedStatus}`,
      );
    }
    console.log(
      `SQL upgrade: judgedStatus backfill=${JSON.stringify(backfill)} (9/10/11 and NULL remain NULL)`,
    );
    await verifyRuntimePaths(upgrade, 'upgrade');
    await upgrade.destroy();
    await admin.end();
  } finally {
    try {
      run('docker', ['rm', '-f', container]);
    } catch {
      /* report below */
    }
    rmSync(dataDir, { recursive: true, force: true });
    try {
      execFileSync('docker', ['inspect', container], { stdio: 'ignore' });
      console.error(`CLEANUP ERROR: container ${container} still exists`);
      process.exitCode = 2;
    } catch {
      console.log(
        `Cleanup: container ${container} removed; ${dataDir} removed`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
