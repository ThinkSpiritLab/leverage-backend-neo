import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddCompeteColumns
 *
 * Additive-only migration.
 * - match.externalJobId  VARCHAR(128) NULL  — external job ID on botzone-neo
 * - gamer.elo            INT DEFAULT 1200   — ELO rating for bot ranking
 */
export class AddCompeteColumns1000000000002 implements MigrationInterface {
  name = 'AddCompeteColumns1000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`match\`
      ADD COLUMN IF NOT EXISTS \`externalJobId\` varchar(128) NULL DEFAULT NULL
        COMMENT 'External job ID on botzone-neo'
    `);

    await queryRunner.query(`
      ALTER TABLE \`gamer\`
      ADD COLUMN IF NOT EXISTS \`elo\` int NOT NULL DEFAULT 1200
        COMMENT 'ELO rating'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`gamer\` DROP COLUMN IF EXISTS \`elo\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`match\` DROP COLUMN IF EXISTS \`externalJobId\``,
    );
  }
}
