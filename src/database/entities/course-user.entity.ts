import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export class CourseUser {
  @PrimaryColumn()
  courseId: number

  @ManyToOne('Course', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: any

  @PrimaryColumn()
  userId: number

  @Index()
  @ManyToOne('User', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: any

  @Column('varchar', { nullable: true })
  courseClass: string | null

  @Column('int', { default: 0 })
  submits: number

  @Column('int', { default: 0 })
  accepts: number

  @Column('datetime', { nullable: true })
  bannedUntil: Date | null

  @Column('varchar', { nullable: true })
  bannedReason: string | null

  @Column('varchar', { nullable: true })
  ip: string | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
