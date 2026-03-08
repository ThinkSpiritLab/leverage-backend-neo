import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export class UserMeta {
  @PrimaryColumn()
  userId: number

  @Index()
  @ManyToOne('User', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: any

  @PrimaryColumn('varchar')
  key: string

  @Column('text')
  valueString: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
