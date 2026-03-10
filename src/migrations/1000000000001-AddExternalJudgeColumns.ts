import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddExternalJudgeColumns
 *
 * Additive-only migration.
 * Adds three nullable columns to the `submission` table for tracking
 * which external judge provider handled the submission.
 *
 * - provider       VARCHAR(32) NULL  — e.g. 'botzone', NULL = heng (legacy)
 * - externalJobId  VARCHAR(128) NULL — job ID on the external platform
 * - providerMeta   TEXT NULL         — JSON metadata from the provider
 */
export class AddExternalJudgeColumns1000000000001 implements MigrationInterface {
  name = 'AddExternalJudgeColumns1000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add provider column with index
    await queryRunner.query(`
      ALTER TABLE \`submission\`
      ADD COLUMN \`provider\` varchar(32) NULL DEFAULT NULL COMMENT 'External judge provider name (null=heng)',
      ADD COLUMN \`externalJobId\` varchar(128) NULL DEFAULT NULL COMMENT 'Job ID from external provider',
      ADD COLUMN \`providerMeta\` text NULL DEFAULT NULL COMMENT 'JSON metadata from external provider'
    `);

    // Add index on provider for efficient fallback polling queries
    await queryRunner.query(`
      CREATE INDEX \`IDX_submission_provider\` ON \`submission\` (\`provider\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX \`IDX_submission_provider\` ON \`submission\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`submission\`
      DROP COLUMN \`provider\`,
      DROP COLUMN \`externalJobId\`,
      DROP COLUMN \`providerMeta\`
    `);
  }
}
