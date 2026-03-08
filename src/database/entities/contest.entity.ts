import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity()
export class Contest {
  @PrimaryGeneratedColumn()
  id: number

  @Column('bool', { default: false })
  allowDirectLogin: boolean

  @Column({ default: 0 })
  deviceBindType: number

  @Index()
  @Column({ nullable: true })
  consultantId: number

  @ManyToOne('User')
  @JoinColumn({ name: 'consultantId' })
  consultant: any

  @Column('varchar', { default: 'contest', comment: '类型：contest | exam' })
  type: string

  @Column('varchar')
  name: string

  @Column('varchar', { default: '' })
  description: string

  @Column('varchar', { default: '', length: 10240 })
  notification: string

  @Column('datetime', { nullable: true })
  registrationEndTime: Date | null

  @Column('datetime')
  startTime: Date

  @Column('datetime')
  endTime: Date

  @Column({ default: 0 })
  penalty: number

  @Column({ default: false })
  public: boolean

  @Column({ default: false })
  scoreByPoint: boolean

  @Column({ default: false })
  openForRegistration: boolean

  @Column('bool', { default: false, comment: '是否完全封榜（只能查看自己）' })
  fullyFreeze: boolean

  @Column({ default: 0 })
  freezeTime: number

  @Column({ default: 0 })
  freezeTimeAfterEnd: number

  @Column('varchar', { nullable: true })
  enabledLanguageJSON: string | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
