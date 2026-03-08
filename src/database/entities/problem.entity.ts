import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'

export enum ProblemStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REJECTED = 2,
}

@Entity()
@Unique(['prefix', 'logicId'])
export class Problem {
  @PrimaryGeneratedColumn()
  id: number

  @Column('varchar', { length: 8, default: 'p' })
  prefix: string

  @Column('int')
  logicId: number

  @Column('varchar')
  title: string

  @Column('text')
  content: string

  @Column('varchar')
  source: string

  @Column('int')
  timeLimit: number

  @Column('int')
  memoryLimit: number

  @Column('int', { nullable: true })
  difficulty: number

  @Column('int', { comment: '测试文件数量', default: 1 })
  cases: number

  @Column('boolean', { comment: '是否为多组输入', default: false, nullable: true })
  multiCases: boolean

  @Column('int', { comment: '提交数', default: 0 })
  submits: number

  @Column('int', { comment: '通过数', default: 0 })
  accepts: number

  @Column('boolean', { comment: '限制访问', default: false })
  restricted: boolean

  @Column({ default: ProblemStatus.PENDING })
  status: ProblemStatus

  @Column({ nullable: true })
  statusUpdatedAt: Date

  @Column('boolean', { comment: '禁止访问', default: true })
  closed: boolean

  @Index()
  @Column({ nullable: true })
  createrId: number

  @ManyToOne('User')
  @JoinColumn({ name: 'createrId' })
  creater: any

  @ManyToMany('Tag', { cascade: true })
  @JoinTable()
  tags: any[]

  @Index()
  @Column({ nullable: true })
  spjId: number

  @ManyToOne('Submission')
  @JoinColumn({ name: 'spjId' })
  spj: any | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
