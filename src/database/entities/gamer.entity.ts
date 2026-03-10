import {
  AfterLoad,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
@Index(['userId', 'gameId'])
export class Gamer {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @ManyToOne('User', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: any;

  @Index()
  @Column()
  gameId: number;

  @ManyToOne('Game', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: any;

  @Column('varchar')
  title: string;

  name?: string;

  @AfterLoad()
  setName() {
    this.name = this.title;
  }

  @Column('varchar')
  language: string;

  @Column('boolean')
  opensource: boolean;

  @Column('text', { select: false })
  code: string;

  @Column('int', { default: 1200, comment: 'ELO rating' })
  elo: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
