import {
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
@Index(['matchId', 'index'], { unique: true })
export class MatchGamerLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  matchId: number;

  @ManyToOne('Match', (match: any) => match.links, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'matchId' })
  match: any;

  @Column('tinyint')
  index: number;

  @Index()
  @Column()
  gamerId: number;

  @ManyToOne('Gamer', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gamerId' })
  gamer: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
