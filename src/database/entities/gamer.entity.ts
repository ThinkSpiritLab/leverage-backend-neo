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
@Index(['userId', 'gameId'])
export class Gamer {
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
  gameId: number

  @ManyToOne('Game', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: any

  @Column('varchar')
  title: string

  @Column('varchar')
  language: string

  @Column('boolean')
  opensource: boolean

  @Column('text', { select: false })
  code: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
