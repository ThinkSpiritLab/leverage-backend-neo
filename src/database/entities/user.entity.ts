import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm'

export type Authority = 'user' | 'admin' | 'superadmin' | string
export type Certification = string

@Entity()
@Unique(['username'])
export class User {
  @PrimaryGeneratedColumn()
  id: number

  @Column('varchar', { length: 20 })
  username: string

  @Column('varchar', { name: 'password', length: 200, select: false })
  passwordHash: string

  @Column('varchar', { nullable: true, length: 32 })
  nickname: string | null

  @Column('varchar', { default: null })
  sex: string

  @Column('varchar', { comment: '用户权限', default: 'user' })
  authority: Authority

  @Column('int', { default: 0 })
  submits: number

  @Column('int', { default: null })
  rank: number

  @Column('int', { default: 0 })
  status: number

  @Column('datetime', { nullable: true })
  statusEndsAt: Date

  @Column('varchar', { default: null })
  remarks: string

  @Column('int', { default: 0 })
  accepts: number

  @Index()
  @Column('varchar', { comment: '真实姓名', length: 32, nullable: true })
  certifiedName: string | null

  @Column('varchar', { comment: '认证类别', length: 32, nullable: true })
  certifyType: Certification | null

  @Column('varchar', { nullable: true, length: 16 })
  grade: string | null

  @Column('varchar', { nullable: true, length: 32 })
  college: string | null

  @Column('varchar', { nullable: true, length: 32 })
  profession: string | null

  @Column('varchar', { nullable: true, length: 32 })
  class: string | null

  /** 180 天未提交: 1, 360 天未提交: 2 */
  @Column('int', { default: 0, select: false })
  shadowed: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @OneToMany('UserMeta', (meta: any) => meta.user, { cascade: true })
  metas: any[]
}
