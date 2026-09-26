import { DataSource, DataSourceOptions, getMetadataArgsStorage } from 'typeorm';

// All entities needed to resolve TypeORM string references
import { User } from '../../src/database/entities/user.entity';
import { Contest } from '../../src/database/entities/contest.entity';
import { ContestUser } from '../../src/database/entities/contest-user.entity';
import { ContestProblem } from '../../src/database/entities/contest-problem.entity';
import { ContestUserProblem } from '../../src/database/entities/contest-user-problem.entity';
import { Problem } from '../../src/database/entities/problem.entity';
import { Tag } from '../../src/database/entities/tag.entity';
import { Submission } from '../../src/database/entities/submission.entity';
import { SubmissionMisc } from '../../src/database/entities/submission-misc.entity';
import { Setting } from '../../src/database/entities/setting.entity';
import { Notification } from '../../src/database/entities/notification.entity';
import { Log } from '../../src/database/entities/log.entity';
import { RejudgeLog } from '../../src/database/entities/rejudge-log.entity';
import { College } from '../../src/database/entities/college.entity';
import { Profession } from '../../src/database/entities/profession.entity';
import { Course } from '../../src/database/entities/course.entity';
import { CourseUser } from '../../src/database/entities/course-user.entity';
import { CourseProblem } from '../../src/database/entities/course-problem.entity';
import { Media } from '../../src/database/entities/media.entity';
import { UserMeta } from '../../src/database/entities/user-meta.entity';
import { Suspicion } from '../../src/database/entities/suspicion.entity';
import { Game } from '../../src/database/entities/game.entity';
import { Gamer } from '../../src/database/entities/gamer.entity';
import { Match } from '../../src/database/entities/match.entity';
import { MatchGamerLink } from '../../src/database/entities/match-gamer-link.entity';

export const ALL_ENTITIES = [
  User,
  Contest,
  ContestUser,
  ContestProblem,
  ContestUserProblem,
  Problem,
  Tag,
  Submission,
  SubmissionMisc,
  Setting,
  Notification,
  Log,
  RejudgeLog,
  College,
  Profession,
  Course,
  CourseUser,
  CourseProblem,
  Media,
  UserMeta,
  Suspicion,
  Game,
  Gamer,
  Match,
  MatchGamerLink,
];

/**
 * Type mapping from MySQL-specific types to SQLite-compatible equivalents.
 * better-sqlite3 does not support: 'bool', 'char', 'mediumtext', 'tinytext',
 * 'longtext', 'mediumblob', 'longblob', 'year', 'enum', etc.
 */
const MYSQL_TO_SQLITE_TYPE: Record<string, string> = {
  bool: 'integer', // MySQL bool alias → integer (0/1)
  enum: 'text', // Preserve enum string values without MySQL's column type
  char: 'text', // Fixed-length char → text
  mediumtext: 'text', // MySQL mediumtext → text
  tinytext: 'text', // MySQL tinytext → text
  longtext: 'text', // MySQL longtext → text
  mediumblob: 'blob', // MySQL mediumblob → blob
  longblob: 'blob', // MySQL longblob → blob
  year: 'integer', // MySQL year → integer
};

/**
 * Patch TypeORM metadata to replace MySQL-specific column types with SQLite-compatible equivalents.
 * Must be called before creating any DataSource.
 */
export function patchBoolColumnsForSqlite(): void {
  const storage = getMetadataArgsStorage();
  storage.columns.forEach((col) => {
    const colType = (col.options as any)?.type;
    if (colType && MYSQL_TO_SQLITE_TYPE[colType]) {
      (col.options as any).type = MYSQL_TO_SQLITE_TYPE[colType];
    }
  });
}

/**
 * Create an in-memory SQLite DataSource with the given entities (or all entities).
 * Automatically synchronizes schema.
 */
export async function createTestDataSource(
  entities: any[] = ALL_ENTITIES,
): Promise<DataSource> {
  // Must patch before initializing DataSource
  patchBoolColumnsForSqlite();

  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities,
    synchronize: true,
    logging: false,
  } as DataSourceOptions);

  await ds.initialize();
  return ds;
}
