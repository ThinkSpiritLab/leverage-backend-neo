import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completes the production schema for entities and raw SQL introduced after the
 * original schema migration. Every addition is guarded because development
 * synchronize may already have installed some of these objects.
 */
export class CompleteEntitySchema1000000000004 implements MigrationInterface {
  name = 'CompleteEntitySchema1000000000004';

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    table: string,
    column: string,
    definition: string,
  ): Promise<void> {
    if (!(await queryRunner.hasColumn(table, column))) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Additional game capabilities.
    await this.addColumnIfMissing(
      queryRunner,
      'game',
      'allowHuman',
      "tinyint(1) NOT NULL DEFAULT '0'",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'game',
      'autoMatchEnabled',
      "tinyint(1) NOT NULL DEFAULT '0'",
    );

    // Gamer fields. `elo` was introduced by AddCompeteColumns already.
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'disabled',
      "tinyint(1) NOT NULL DEFAULT '0'",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'eloExternal',
      "int NOT NULL DEFAULT '1200'",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'type',
      "enum('code','webhook','human','external') NOT NULL DEFAULT 'code'",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'botApiKey',
      'varchar(64) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'botApiKeyExpiresAt',
      'datetime NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'webhookUrl',
      'varchar(512) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'webhookSecret',
      'varchar(128) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'gamer',
      'isTest',
      "tinyint(1) NOT NULL DEFAULT '0'",
    );

    // Match and match-gamer result fields.
    await this.addColumnIfMissing(
      queryRunner,
      'match',
      'isTest',
      "tinyint NOT NULL DEFAULT '0'",
    );
    await this.addColumnIfMissing(
      queryRunner,
      'match_gamer_link',
      'won',
      'tinyint NULL DEFAULT NULL',
    );

    // Special-judge checker configuration.
    await this.addColumnIfMissing(
      queryRunner,
      'problem',
      'checkerCode',
      'text NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'problem',
      'checkerLanguage',
      'varchar(32) NULL DEFAULT NULL',
    );

    // Rejudge accounting: latest terminal status whose side effects were applied.
    await this.addColumnIfMissing(
      queryRunner,
      'submission',
      'judgeAttempt',
      'varchar(32) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'submission',
      'judgedStatus',
      'int NULL DEFAULT NULL',
    );
    // User profile fields added after the baseline entity schema.
    await this.addColumnIfMissing(
      queryRunner,
      'user',
      'email',
      'varchar(100) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'user',
      'studentId',
      'varchar(32) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'tag',
      'color',
      'varchar(32) NULL DEFAULT NULL',
    );
    await this.addColumnIfMissing(
      queryRunner,
      'contest',
      'type',
      "varchar(255) NOT NULL DEFAULT 'contest'",
    );
    await queryRunner.query(`
      UPDATE \`submission\`
      SET \`judgedStatus\` = \`status\`
      WHERE \`judgedStatus\` IS NULL
        AND \`status\` IS NOT NULL
        AND \`status\` NOT IN (9, 10, 11)
    `);

    // API-key entity table; preserve uniqueness/index semantics from decorators.
    if (!(await queryRunner.hasTable('message'))) {
      const naming = queryRunner.connection.namingStrategy;
      await queryRunner.query(`
        CREATE TABLE \`message\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`senderId\` int NULL,
          \`receiverId\` int NULL,
          \`sessionId\` int NULL,
          \`content\` text NOT NULL,
          \`read\` tinyint(1) NOT NULL DEFAULT '0',
          \`closed\` tinyint(1) NULL DEFAULT '0',
          \`deleted\` tinyint(1) NULL DEFAULT '0',
          \`messageUpdatedAt\` datetime NOT NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX \`${naming.indexName('message', ['senderId'])}\` (\`senderId\`),
          INDEX \`${naming.indexName('message', ['receiverId'])}\` (\`receiverId\`),
          INDEX \`${naming.indexName('message', ['sessionId'])}\` (\`sessionId\`),
          INDEX \`${naming.indexName('message', ['read'])}\` (\`read\`),
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`${naming.foreignKeyName('message', ['senderId'], 'user', ['id'])}\` FOREIGN KEY (\`senderId\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION,
          CONSTRAINT \`${naming.foreignKeyName('message', ['receiverId'], 'user', ['id'])}\` FOREIGN KEY (\`receiverId\`) REFERENCES \`user\` (\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION
        ) ENGINE=InnoDB
      `);
    }

    // API-key entity table; preserve uniqueness/index semantics from decorators.
    if (!(await queryRunner.hasTable('user_api_key'))) {
      const naming = queryRunner.connection.namingStrategy;
      await queryRunner.query(`
        CREATE TABLE \`user_api_key\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`userId\` int NOT NULL,
          \`name\` varchar(50) NOT NULL COMMENT 'API Key 名称',
          \`keyPrefix\` varchar(12) NOT NULL COMMENT '密钥前缀，用于展示识别',
          \`keyHash\` varchar(64) NOT NULL COMMENT 'SHA-256 哈希',
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`revokedAt\` datetime NULL COMMENT '撤销时间',
          \`lastUsedAt\` datetime NULL COMMENT '最后使用时间',
          UNIQUE INDEX \`${naming.indexName('user_api_key', ['keyHash'])}\` (\`keyHash\`),
          INDEX \`${naming.indexName('user_api_key', ['userId'])}\` (\`userId\`),
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`${naming.foreignKeyName('user_api_key', ['userId'], 'user', ['id'])}\` FOREIGN KEY (\`userId\`)
            REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
        ) ENGINE=InnoDB
      `);
    }

    // Used by CompeteService's native INSERT/SELECT SQL (not an ORM entity).
    if (!(await queryRunner.hasTable('gamer_elo_history'))) {
      await queryRunner.query(`
        CREATE TABLE \`gamer_elo_history\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`gamerId\` int NOT NULL,
          \`matchId\` int NOT NULL,
          \`eloBefore\` int NOT NULL,
          \`eloAfter\` int NOT NULL,
          \`eloDelta\` int NOT NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          INDEX \`IDX_gamer_elo_history_gamer_created\` (\`gamerId\`, \`createdAt\`),
          INDEX \`IDX_gamer_elo_history_gamer\` (\`gamerId\`),
          INDEX \`IDX_gamer_elo_history_match\` (\`matchId\`),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB
      `);
    }
  }

  /**
   * Intentionally conservative: guarded additions may have pre-existed due to
   * synchronize, and new tables may contain live API keys/ELO history by the
   * time this migration is reverted. Automatic DROP would risk deleting either
   * pre-migration data or data written after deployment. Remove objects only
   * after an operator has backed them up and confirmed their provenance.
   */
  public async down(): Promise<void> {
    // No safe automatic rollback: see method documentation.
  }
}
