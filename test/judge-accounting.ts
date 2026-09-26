/** pnpm exec ts-node --transpile-only test/judge-accounting.ts
 * Real MariaDB locks/rollback against migrations (no synchronize, no judge calls).
 * Starts and removes its own temporary container. Requires Docker.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import path from 'node:path';
import { MariaDbContainer } from '@testcontainers/mariadb';
import { DataSource } from 'typeorm';
import { ReceiveService } from '../src/modules/receive/receive.service';
import { Submission } from '../src/database/entities/submission.entity';
import { SubmissionMisc } from '../src/database/entities/submission-misc.entity';
import { User } from '../src/database/entities/user.entity';
import { Problem } from '../src/database/entities/problem.entity';
import { Contest } from '../src/database/entities/contest.entity';
import { ContestUser } from '../src/database/entities/contest-user.entity';
import { ContestProblem } from '../src/database/entities/contest-problem.entity';
import { ContestUserProblem } from '../src/database/entities/contest-user-problem.entity';
import { Course } from '../src/database/entities/course.entity';
import { CourseUser } from '../src/database/entities/course-user.entity';
import { CourseProblem } from '../src/database/entities/course-problem.entity';
import { Status } from '../src/modules/judge-runtime/judge-status';

async function main() {
  const container = await new MariaDbContainer('mariadb:10.11')
    .withDatabase('accounting_test')
    .withUsername('test')
    .withUserPassword('testpass')
    .withTmpFs({ '/var/lib/mysql': 'rw' })
    .start();
  let db: DataSource | undefined;
  try {
    db = await new DataSource({
      type: 'mariadb',
      host: container.getHost(),
      port: container.getMappedPort(3306),
      username: 'test',
      password: 'testpass',
      database: 'accounting_test',
      synchronize: false,
      entities: [path.join(__dirname, '../src/database/entities/*.entity.ts')],
      migrations: [path.join(__dirname, '../src/migrations/*.ts')],
    }).initialize();
    await db.runMigrations({ transaction: 'none' });
    const ranks = {
      updateContestRank: async () => {},
      updateCourseRank: async () => {},
    };
    const service = new ReceiveService(db, ranks as any);
    const user = await db
      .getRepository(User)
      .save({ username: 'accounting', passwordHash: 'unused' });
    const problem = await db
      .getRepository(Problem)
      .save({
        logicId: 1,
        title: 'test',
        content: '',
        source: '',
        timeLimit: 1000,
        memoryLimit: 256,
      });
    const dates = {
      name: 'test',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
    };
    const contest = await db.getRepository(Contest).save({ ...dates });
    const course = await db.getRepository(Course).save({ ...dates });
    await db
      .getRepository(ContestUser)
      .save({ contestId: contest.id, userId: user.id });
    await db
      .getRepository(ContestProblem)
      .save({ contestId: contest.id, problemId: problem.id });
    await db
      .getRepository(CourseUser)
      .save({ courseId: course.id, userId: user.id });
    await db
      .getRepository(CourseProblem)
      .save({ courseId: course.id, problemId: problem.id });
    const subs = db.getRepository(Submission);
    const make = async (provider: 'internal') => {
      const s = await subs.save({
        userId: user.id,
        problemId: problem.id,
        language: 1,
        provider,
        status: Status.PENDING,
        judgeAttempt: 'a'.repeat(32),
        externalJobId: null,
        contestId: contest.id,
        courseId: course.id,
      });
      await db!
        .getRepository(SubmissionMisc)
        .save({ submissionId: s.id, code: 'int main(){}' });
      return s;
    };
    const finish = (
      s: Submission,
      status = Status.AC,
      attemptId = 'a'.repeat(32),
    ) =>
      service.finalize(
        s.id,
        { done: true, status, time: 1, memory: 1 },
        {
          provider: 'internal',
          attemptId,
        },
      );
    const readCounts = async () => {
      const u = await db!.getRepository(User).findOneByOrFail({ id: user.id });
      const p = await db!
        .getRepository(Problem)
        .findOneByOrFail({ id: problem.id });
      const cu = await db!
        .getRepository(ContestUser)
        .findOneByOrFail({ contestId: contest.id, userId: user.id });
      const courseUser = await db!
        .getRepository(CourseUser)
        .findOneByOrFail({ courseId: course.id, userId: user.id });
      return [
        u.submits,
        u.accepts,
        p.submits,
        p.accepts,
        cu.submits,
        cu.accepts,
        courseUser.submits,
        courseUser.accepts,
      ];
    };
    const first = await make('internal');
    await Promise.all(Array.from({ length: 8 }, () => finish(first)));
    assert.deepEqual(await readCounts(), [1, 1, 1, 1, 1, 1, 1, 1]);
    console.log('PASS concurrent duplicate internal results account exactly once');

    const second = await make('internal');
    const third = await make('internal');
    await Promise.all([finish(second), finish(third)]);
    assert.deepEqual(await readCounts(), [3, 1, 3, 3, 3, 1, 3, 1]);
    assert.equal(await db.getRepository(ContestUserProblem).count(), 1);
    console.log(
      'PASS concurrent ACs of the same problem count one solved problem',
    );

    for (const s of [first, second, third]) {
      await subs.update(s.id, {
        status: Status.PENDING,
        judgeAttempt: 'b'.repeat(32),
      });
      await finish(s, Status.AC); // old attempt is stale, even while pending
      assert.equal(
        (await subs.findOneByOrFail({ id: s.id })).status,
        Status.PENDING,
      );
      await finish(s, Status.WA, 'b'.repeat(32));
    }
    assert.deepEqual(await readCounts(), [3, 0, 3, 0, 3, 0, 3, 0]);
    assert.equal(await db.getRepository(ContestUserProblem).count(), 0);
    console.log(
      'PASS stale attempts are ignored and AC→WA rejudges reverse contributions',
    );

    await subs.update(first.id, {
      status: Status.PENDING,
      judgeAttempt: 'c'.repeat(32),
    });
    await finish(first, Status.AC, 'c'.repeat(32));
    assert.deepEqual(await readCounts(), [3, 1, 3, 1, 3, 1, 3, 1]);
    console.log(
      'PASS WA→AC rejudge restores solved counts without increasing submission counts',
    );

    const fourth = await make('internal');
    const failing = new ReceiveService(
      {
        transaction: (fn: any) =>
          db!.transaction(async (manager) => {
            await fn(manager);
            throw new Error('forced rollback');
          }),
      } as unknown as DataSource,
      ranks as any,
    );
    await assert.rejects(
      failing.finalize(
        fourth.id,
        { done: true, status: Status.AC },
        { provider: 'internal', attemptId: 'a'.repeat(32) },
      ),
      /forced rollback/,
    );
    assert.equal(
      (await subs.findOneByOrFail({ id: fourth.id })).status,
      Status.PENDING,
    );
    assert.deepEqual(await readCounts(), [3, 1, 3, 1, 3, 1, 3, 1]);
    console.log(
      'PASS failed SQL transaction leaves status and every counter unchanged',
    );
  } finally {
    if (db?.isInitialized) await db.destroy();
    await container.stop();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
