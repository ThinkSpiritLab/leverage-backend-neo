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

  @ManyToOne('Match', (match: { links: MatchGamerLink[] }) => match.links, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'matchId' })
  match: any;

  @Column('tinyint')
  index: number;

  @Column({ type: 'tinyint', nullable: true, default: null, comment: '1=赢,0=输/平,NULL=未结束' })
  won: number | null;

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
