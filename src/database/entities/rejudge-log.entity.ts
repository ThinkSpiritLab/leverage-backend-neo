import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

@Entity()
export class RejudgeLog {
  @PrimaryGeneratedColumn()
  id: number

  @Index()
  @Column()
  submissionId: number

  @ManyToOne('Submission', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: any

  @Column('int', { nullable: true })
  status: number

  @Column('varchar', { length: 24, nullable: true })
  judger: string | null

  @Column('int', { nullable: true })
  time: number

  @Column('int', { nullable: true })
  memory: number

  @Column('text', { nullable: true })
  judgeResult?: string

  @Column('text', { nullable: true })
  compileErrorMsg?: string

  @Column('datetime')
  submittedAt: Date

  @CreateDateColumn()
  createdAt: Date
}
