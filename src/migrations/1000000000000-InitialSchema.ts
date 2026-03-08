import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1000000000000 implements MigrationInterface {
  name = 'InitialSchema1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 独立表（无外键依赖）────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`college\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`college\` varchar(255) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_fd1bbd2444c41a8c655dfde8935\` (\`college\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`profession\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`profession\` varchar(255) NOT NULL,
        \`college\` varchar(255) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_0bf9d2205d32534fbd303ed8f2f\` (\`college\`, \`profession\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`notification\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`title\` varchar(40) NOT NULL,
        \`content\` text NOT NULL,
        \`deleted\` tinyint(1) NOT NULL DEFAULT '0',
        \`highlight\` tinyint(1) NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`media\` (
        \`id\` varchar(7) NOT NULL,
        \`originalName\` varchar(255) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`setting\` (
        \`key\` varchar(255) NOT NULL,
        \`value\` varchar(1024) NOT NULL DEFAULT '',
        \`note\` varchar(255) NOT NULL DEFAULT '',
        \`type\` text NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`game\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`title\` varchar(255) NOT NULL,
        \`description\` text NOT NULL,
        \`timeLimit\` int NOT NULL,
        \`memoryLimit\` int NOT NULL,
        \`gamerQuantity\` int NOT NULL DEFAULT '2',
        \`disabled\` tinyint(1) NOT NULL DEFAULT '1',
        \`judgerCode\` text NOT NULL,
        \`judgerLanguage\` varchar(255) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`course\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`teacher\` varchar(255) NOT NULL DEFAULT '',
        \`notification\` varchar(10240) NOT NULL DEFAULT '',
        \`startTime\` datetime NOT NULL,
        \`endTime\` datetime NOT NULL,
        \`type\` int NOT NULL DEFAULT '0',
        \`archived\` tinyint(1) NOT NULL DEFAULT '0',
        \`enabledLanguageJSON\` varchar(255) NULL,
        \`scoreByPoint\` tinyint(1) NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    // ── user（无外键）─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`username\` varchar(20) NOT NULL,
        \`password\` varchar(200) NOT NULL,
        \`nickname\` varchar(32) NULL,
        \`sex\` varchar(255) NULL DEFAULT NULL,
        \`authority\` varchar(255) NOT NULL DEFAULT 'user',
        \`submits\` int NOT NULL DEFAULT '0',
        \`rank\` int NULL DEFAULT NULL,
        \`status\` int NOT NULL DEFAULT '0',
        \`statusEndsAt\` datetime NULL,
        \`remarks\` varchar(255) NULL DEFAULT NULL,
        \`accepts\` int NOT NULL DEFAULT '0',
        \`certifiedName\` varchar(32) NULL,
        \`certifyType\` varchar(32) NULL,
        \`grade\` varchar(16) NULL,
        \`college\` varchar(32) NULL,
        \`profession\` varchar(32) NULL,
        \`class\` varchar(32) NULL,
        \`shadowed\` int NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_78a916df40e02a9deb1c4b75edb\` (\`username\`),
        INDEX \`IDX_b0c19523e43902705a95c53c3f\` (\`certifiedName\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    // ── tag（自引用 FK）──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tag\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`parentId\` int NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_5f4effb7cd258ffa9ef554cfbbb\` FOREIGN KEY (\`parentId\`) REFERENCES \`tag\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`tag_closure\` (
        \`id_ancestor\` int NOT NULL,
        \`id_descendant\` int NOT NULL,
        INDEX \`IDX_32bf6c25aa9e397fe11403b314\` (\`id_ancestor\`),
        INDEX \`IDX_e59d05669a7d8259abc4b319d8\` (\`id_descendant\`),
        PRIMARY KEY (\`id_ancestor\`, \`id_descendant\`),
        CONSTRAINT \`FK_32bf6c25aa9e397fe11403b314c\` FOREIGN KEY (\`id_ancestor\`) REFERENCES \`tag\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_e59d05669a7d8259abc4b319d8a\` FOREIGN KEY (\`id_descendant\`) REFERENCES \`tag\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── contest（FK → user）───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`allowDirectLogin\` tinyint(1) NOT NULL DEFAULT '0',
        \`deviceBindType\` int NOT NULL DEFAULT '0',
        \`consultantId\` int NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(255) NOT NULL DEFAULT '',
        \`notification\` varchar(10240) NOT NULL DEFAULT '',
        \`registrationEndTime\` datetime NULL,
        \`startTime\` datetime NOT NULL,
        \`endTime\` datetime NOT NULL,
        \`penalty\` int NOT NULL DEFAULT '0',
        \`public\` tinyint(1) NOT NULL DEFAULT '0',
        \`scoreByPoint\` tinyint(1) NOT NULL DEFAULT '0',
        \`openForRegistration\` tinyint(1) NOT NULL DEFAULT '0',
        \`fullyFreeze\` tinyint(1) NOT NULL DEFAULT '0',
        \`freezeTime\` int NOT NULL DEFAULT '0',
        \`freezeTimeAfterEnd\` int NOT NULL DEFAULT '0',
        \`enabledLanguageJSON\` varchar(255) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_04e6734f093a99b845b4c40d11\` (\`consultantId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_04e6734f093a99b845b4c40d11c\` FOREIGN KEY (\`consultantId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── problem（FK → user；暂不加 spjId FK，避免循环依赖）─────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`problem\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`prefix\` varchar(8) NOT NULL DEFAULT 'p',
        \`logicId\` int NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`content\` text NOT NULL,
        \`source\` varchar(255) NOT NULL,
        \`timeLimit\` int NOT NULL,
        \`memoryLimit\` int NOT NULL,
        \`difficulty\` int NULL,
        \`cases\` int NOT NULL DEFAULT '1',
        \`multiCases\` tinyint(1) NULL DEFAULT '0',
        \`submits\` int NOT NULL DEFAULT '0',
        \`accepts\` int NOT NULL DEFAULT '0',
        \`restricted\` tinyint(1) NOT NULL DEFAULT '0',
        \`status\` int NOT NULL DEFAULT '0',
        \`statusUpdatedAt\` datetime NULL,
        \`closed\` tinyint(1) NOT NULL DEFAULT '1',
        \`createrId\` int NULL,
        \`spjId\` int NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`UQ_0464c37f6ad5f38e9e095653e40\` (\`prefix\`, \`logicId\`),
        INDEX \`IDX_e7acd5053072483fc050478ca0\` (\`createrId\`),
        INDEX \`IDX_867b5ee34d00db69cb87100355\` (\`spjId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_e7acd5053072483fc050478ca08\` FOREIGN KEY (\`createrId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── problem_tags_tag（ManyToMany join table）──────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`problem_tags_tag\` (
        \`problemId\` int NOT NULL,
        \`tagId\` int NOT NULL,
        INDEX \`IDX_5bfb320d5d9a8a81993c2ebd61\` (\`problemId\`),
        INDEX \`IDX_e8d88847fa420928dd123e93b5\` (\`tagId\`),
        PRIMARY KEY (\`problemId\`, \`tagId\`),
        CONSTRAINT \`FK_5bfb320d5d9a8a81993c2ebd61b\` FOREIGN KEY (\`problemId\`) REFERENCES \`problem\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`FK_e8d88847fa420928dd123e93b51\` FOREIGN KEY (\`tagId\`) REFERENCES \`tag\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB
    `);

    // ── submission（FK → user, problem, course, contest）────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`submission\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` int NOT NULL,
        \`problemId\` int NOT NULL,
        \`language\` int NOT NULL,
        \`time\` int NULL,
        \`memory\` int NULL,
        \`status\` int NULL,
        \`judger\` varchar(24) NULL,
        \`courseId\` int NULL,
        \`contestId\` int NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_7bd626272858ef6464aa257909\` (\`userId\`),
        INDEX \`IDX_3182d5e825aa9dee60559030d4\` (\`problemId\`),
        INDEX \`IDX_d68e165dbb1f54da4a2ee4c163\` (\`language\`),
        INDEX \`IDX_04a58564ad172e19f4ba1ca5d3\` (\`status\`),
        INDEX \`IDX_497c52c7cc9496b41fce5afae6\` (\`courseId\`),
        INDEX \`IDX_544c5a49372480c486c00545ea\` (\`contestId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_7bd626272858ef6464aa2579094\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT \`FK_3182d5e825aa9dee60559030d49\` FOREIGN KEY (\`problemId\`) REFERENCES \`problem\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_497c52c7cc9496b41fce5afae6d\` FOREIGN KEY (\`courseId\`) REFERENCES \`course\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_544c5a49372480c486c00545eae\` FOREIGN KEY (\`contestId\`) REFERENCES \`contest\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── 解决循环依赖：problem.spjId → submission ─────────────────────
    await queryRunner.query(`
      ALTER TABLE \`problem\`
      ADD CONSTRAINT \`FK_867b5ee34d00db69cb871003552\`
      FOREIGN KEY (\`spjId\`) REFERENCES \`submission\` (\`id\`)
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // ── submission 衍生表 ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`submission_misc\` (
        \`submissionId\` int NOT NULL,
        \`judgeResult\` text NULL,
        \`code\` text NOT NULL,
        \`compileErrorMsg\` text NULL,
        PRIMARY KEY (\`submissionId\`),
        CONSTRAINT \`FK_bc8da872d15f35cb45a4d71270f\` FOREIGN KEY (\`submissionId\`) REFERENCES \`submission\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`suspicion\` (
        \`submissionId\` int NOT NULL,
        \`mas0\` int NOT NULL DEFAULT '0',
        \`md1\` int NOT NULL DEFAULT '0',
        \`def\` int NOT NULL DEFAULT '0',
        \`con\` int NOT NULL DEFAULT '0',
        \`cpp\` int NOT NULL DEFAULT '0',
        \`oo\` int NOT NULL DEFAULT '0',
        \`cr\` int NOT NULL DEFAULT '0',
        \`html\` int NOT NULL DEFAULT '0',
        \`chn\` int NOT NULL DEFAULT '0',
        \`qq\` int NOT NULL DEFAULT '0',
        \`checked\` tinyint(1) NOT NULL DEFAULT '0',
        \`hashsum\` varchar(100) NULL,
        PRIMARY KEY (\`submissionId\`),
        CONSTRAINT \`FK_db9fe96e433dbc3f320fd95e8de\` FOREIGN KEY (\`submissionId\`) REFERENCES \`submission\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`rejudge_log\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`submissionId\` int NOT NULL,
        \`status\` int NULL,
        \`judger\` varchar(24) NULL,
        \`time\` int NULL,
        \`memory\` int NULL,
        \`judgeResult\` text NULL,
        \`compileErrorMsg\` text NULL,
        \`submittedAt\` datetime NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_9f5081c9a98ddee17c8ffc090a\` (\`submissionId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_9f5081c9a98ddee17c8ffc090a9\` FOREIGN KEY (\`submissionId\`) REFERENCES \`submission\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── contest 关联表 ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_user\` (
        \`contestId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`password\` varchar(255) NULL,
        \`room\` varchar(255) NULL,
        \`seat\` varchar(255) NULL,
        \`submits\` int NOT NULL DEFAULT '0',
        \`accepts\` int NOT NULL DEFAULT '0',
        \`wildcard\` tinyint(1) NOT NULL DEFAULT '0',
        \`female\` tinyint(1) NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_f23536d940dfa5b05384575875\` (\`userId\`),
        PRIMARY KEY (\`contestId\`, \`userId\`),
        CONSTRAINT \`FK_05cc850f3cc947776dd510c6dc6\` FOREIGN KEY (\`contestId\`) REFERENCES \`contest\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_f23536d940dfa5b053845758756\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_problem\` (
        \`contestId\` int NOT NULL,
        \`problemId\` int NOT NULL,
        \`weight\` int NOT NULL DEFAULT '1',
        \`label\` char(1) NULL,
        \`color\` varchar(20) NULL,
        \`submits\` int NOT NULL DEFAULT '0',
        \`accepts\` int NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_4ee151e7518247b13d7069ae6f\` (\`problemId\`),
        PRIMARY KEY (\`contestId\`, \`problemId\`),
        CONSTRAINT \`FK_62eec1907733dae6d4ef096afdb\` FOREIGN KEY (\`contestId\`) REFERENCES \`contest\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_4ee151e7518247b13d7069ae6f9\` FOREIGN KEY (\`problemId\`) REFERENCES \`problem\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`contest_user_problem\` (
        \`contestUserContestId\` int NOT NULL,
        \`contestUserUserId\` int NOT NULL,
        \`contestProblemId\` int NOT NULL,
        \`sent\` tinyint(1) NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_42a341656da21b0f29de01dfd1\` (\`contestUserContestId\`, \`contestUserUserId\`),
        PRIMARY KEY (\`contestUserContestId\`, \`contestUserUserId\`, \`contestProblemId\`),
        CONSTRAINT \`FK_42a341656da21b0f29de01dfd14\` FOREIGN KEY (\`contestUserContestId\`, \`contestUserUserId\`) REFERENCES \`contest_user\` (\`contestId\`, \`userId\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── course 关联表 ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`course_user\` (
        \`courseId\` int NOT NULL,
        \`userId\` int NOT NULL,
        \`courseClass\` varchar(255) NULL,
        \`submits\` int NOT NULL DEFAULT '0',
        \`accepts\` int NOT NULL DEFAULT '0',
        \`bannedUntil\` datetime NULL,
        \`bannedReason\` varchar(255) NULL,
        \`ip\` varchar(255) NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_062e03d78da22a7bd9becbfaaa\` (\`userId\`),
        PRIMARY KEY (\`courseId\`, \`userId\`),
        CONSTRAINT \`FK_70824fef35e6038e459e58e0358\` FOREIGN KEY (\`courseId\`) REFERENCES \`course\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_062e03d78da22a7bd9becbfaaac\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`course_problem\` (
        \`courseId\` int NOT NULL,
        \`problemId\` int NOT NULL,
        \`submits\` int NOT NULL DEFAULT '0',
        \`accepts\` int NOT NULL DEFAULT '0',
        \`threshold\` int NOT NULL DEFAULT '0',
        \`weight\` int NOT NULL DEFAULT '1',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_b033915daaf4d914edd876d871\` (\`problemId\`),
        PRIMARY KEY (\`courseId\`, \`problemId\`),
        CONSTRAINT \`FK_21a35e291ee4423a94bfda428f6\` FOREIGN KEY (\`courseId\`) REFERENCES \`course\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_b033915daaf4d914edd876d8713\` FOREIGN KEY (\`problemId\`) REFERENCES \`problem\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── game 关联表 ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`gamer\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`userId\` int NOT NULL,
        \`gameId\` int NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`language\` varchar(255) NOT NULL,
        \`opensource\` tinyint(1) NOT NULL,
        \`code\` text NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_d0fca4a606dacf3eba209467b5\` (\`userId\`),
        INDEX \`IDX_9358ea9a7e40725dc8d44d596b\` (\`gameId\`),
        INDEX \`IDX_80eb170431cdde8e756ff39b3f\` (\`userId\`, \`gameId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_d0fca4a606dacf3eba209467b58\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT \`FK_9358ea9a7e40725dc8d44d596b5\` FOREIGN KEY (\`gameId\`) REFERENCES \`game\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`match\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`gameId\` int NOT NULL,
        \`status\` int NOT NULL DEFAULT '0',
        \`result\` mediumtext NULL,
        \`score\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_877a1f76b4f63193688cc31608\` (\`gameId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_877a1f76b4f63193688cc316086\` FOREIGN KEY (\`gameId\`) REFERENCES \`game\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`match_gamer_link\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`matchId\` int NOT NULL,
        \`index\` tinyint NOT NULL,
        \`gamerId\` int NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_035a5cb95c6bb0ea51f0bd9820\` (\`matchId\`),
        INDEX \`IDX_9ac7fa3af94353c5776611113b\` (\`gamerId\`),
        UNIQUE INDEX \`IDX_8fcb0d3aeec5874c8ba20fcf2b\` (\`matchId\`, \`index\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_035a5cb95c6bb0ea51f0bd98204\` FOREIGN KEY (\`matchId\`) REFERENCES \`match\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT \`FK_9ac7fa3af94353c5776611113b5\` FOREIGN KEY (\`gamerId\`) REFERENCES \`gamer\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    // ── user 关联表 ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user_meta\` (
        \`userId\` int NOT NULL,
        \`key\` varchar(255) NOT NULL,
        \`valueString\` text NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`IDX_f6c72c83c1787aee12530dbcd0\` (\`userId\`),
        PRIMARY KEY (\`userId\`, \`key\`),
        CONSTRAINT \`FK_f6c72c83c1787aee12530dbcd05\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`log\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`callerId\` int NULL,
        \`field\` varchar(255) NULL,
        \`action\` varchar(255) NULL,
        \`payload\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_204cd8a4d810a885336a48db9a\` (\`callerId\`),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_204cd8a4d810a885336a48db9a6\` FOREIGN KEY (\`callerId\`) REFERENCES \`user\` (\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 先解除循环依赖 FK
    await queryRunner.query(
      `ALTER TABLE \`problem\` DROP FOREIGN KEY \`FK_867b5ee34d00db69cb871003552\``,
    );

    // 按依赖关系逆序删表
    await queryRunner.query(`DROP TABLE IF EXISTS \`log\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`user_meta\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`match_gamer_link\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`match\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`gamer\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`course_problem\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`course_user\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`contest_user_problem\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`contest_problem\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`contest_user\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`rejudge_log\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`suspicion\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`submission_misc\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`submission\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`problem_tags_tag\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`problem\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`contest\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`tag_closure\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`tag\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`user\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`course\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`game\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`setting\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`media\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`notification\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`profession\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`college\``);
  }
}
