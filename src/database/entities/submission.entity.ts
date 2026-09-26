import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(['userId', 'problemId'])
export class Submission {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @ManyToOne('User', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: any;

  @Index()
  @Column()
  problemId: number;

  @ManyToOne('Problem', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problemId' })
  problem: any;

  @Column()
  @Index()
  language: number;

  @Column('int', { nullable: true })
  time: number;

  @Column('int', { nullable: true })
  memory: number;

  @OneToOne('SubmissionMisc', (s: { submission: Submission }) => s.submission, {
    cascade: true,
  })
  misc: any;

  @OneToOne('Suspicion', (s: { submission: Submission }) => s.submission, {
    cascade: true,
  })
  sus?: any;

  @Column('int', { nullable: true })
  @Index()
  status: number;

  @Column('varchar', { length: 24, nullable: true })
  judger: string | null;

  @Index()
  @Column({ nullable: true })
  courseId: number | null;

  @ManyToOne('Course', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: any;

  @Index()
  @Column({ nullable: true })
  contestId: number | null;

  @ManyToOne('Contest', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: any;

  @OneToMany('RejudgeLog', (r: { submission: Submission }) => r.submission)
  rejudgeLogs: any[];

  // ─── External judge provider fields (additive, nullable) ──────────────────

  /**
   * Name of the external judge provider used for this submission.
   * null = legacy / heng (default).
   * 'botzone' = submitted to botzone-neo.
   */
  @Index()
  @Column('varchar', { length: 32, nullable: true, default: null })
  provider: string | null;

  /**
   * Job ID returned by the external judge provider.
   * Used for fallback polling and idempotent callback handling.
   */
  @Column('varchar', { length: 128, nullable: true, default: null })
  externalJobId: string | null;

  /**
   * Arbitrary metadata from the external provider (JSON string).
   * Stored as text to remain schema-agnostic.
   */
  @Column('text', { nullable: true, default: null })
  providerMeta: string | null;

  /** Identifies the current dispatch; retained until the next rejudge. */
  @Column('varchar', { length: 32, nullable: true })
  judgeAttempt?: string | null;

  /** Last result included in counters, preserved while a rejudge is pending. */
  @Column('int', { nullable: true })
  judgedStatus?: number | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
