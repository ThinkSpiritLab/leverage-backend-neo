import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddGameRendererHtml
 *
 * Additive-only migration.
 * - game.rendererHtml  TEXT NULL  — user-supplied HTML renderer for Botzone replays
 */
export class AddGameRendererHtml1000000000003 implements MigrationInterface {
  name = 'AddGameRendererHtml1000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`game\`
      ADD COLUMN IF NOT EXISTS \`rendererHtml\` longtext NULL DEFAULT NULL
        COMMENT 'Custom HTML renderer for Botzone replay visualization'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`game\` DROP COLUMN IF EXISTS \`rendererHtml\``,
    );
  }
}
