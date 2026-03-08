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
} from 'typeorm'

@Entity()
export class Submission {
  @PrimaryGeneratedColumn()
  id: number

  @Index()
  @Column()
  userId: number

  @ManyToOne('User', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: any

  @Index()
  @Column()
  problemId: number

  @ManyToOne('Problem', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problemId' })
  problem: any

  @Column()
  @Index()
  language: number

  @Column('int', { nullable: true })
  time: number

  @Column('int', { nullable: true })
  memory: number

  @OneToOne('SubmissionMisc', (s: any) => s.submission, { cascade: true })
  misc: any

  @OneToOne('Suspicion', (s: any) => s.submission, { cascade: true })
  sus?: any

  @Column('int', { nullable: true })
  @Index()
  status: number

  @Column('varchar', { length: 24, nullable: true })
  judger: string | null

  @Index()
  @Column({ nullable: true })
  courseId: number | null

  @ManyToOne('Course', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: any

  @Index()
  @Column({ nullable: true })
  contestId: number | null

  @ManyToOne('Contest', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: any

  @OneToMany('RejudgeLog', (r: any) => r.submission)
  rejudgeLogs: any[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
