import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export class Course {
  @PrimaryGeneratedColumn()
  id: number

  @Column('varchar')
  name: string

  @Column('varchar', { default: '' })
  teacher: string

  @Column('varchar', { default: '', length: 10240 })
  notification: string

  @Column('datetime')
  startTime: Date

  @Column('datetime')
  endTime: Date

  @Column({ default: 0 })
  type: number

  @Column('boolean', { default: false })
  archived: boolean

  @Column('varchar', { nullable: true })
  enabledLanguageJSON: string | null

  @Column({ default: false })
  scoreByPoint: boolean

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
