import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity()
export class ContestProblem {
  @PrimaryColumn()
  contestId: number

  @ManyToOne('Contest', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: any

  @PrimaryColumn()
  problemId: number

  @Index()
  @ManyToOne('Problem', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problemId' })
  problem: any

  @Column('int', { default: 1 })
  weight: number

  @Column('char', { length: 1, nullable: true })
  label: string | null

  @Column('varchar', { length: 20, nullable: true })
  color: string | null

  @Column('int', { comment: '提交数', default: 0 })
  submits: number

  @Column('int', { comment: '通过数', default: 0 })
  accepts: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
