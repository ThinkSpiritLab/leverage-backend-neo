import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** ELO 历史记录——每场对局结束后记录一条 */
@Entity('gamer_elo_history')
@Index(['gamerId', 'createdAt'])
export class GamerEloHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  gamerId: number;

  @Column()
  @Index()
  matchId: number;

  @Column('int')
  eloBefore: number;

  @Column('int')
  eloAfter: number;

  @Column('int')
  eloDelta: number;

  @CreateDateColumn()
  createdAt: Date;
}
