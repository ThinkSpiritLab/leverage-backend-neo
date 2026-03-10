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

  @Column('int', { default: 1200, comment: 'ELO rating（内榜，仅code类型对局）' })
  elo: number;

  @Column('int', { default: 1200, comment: 'ELO rating（外榜，含human/external/webhook）' })
  eloExternal: number;

  @Column({ type: 'enum', enum: ['code', 'webhook', 'human', 'external'], default: 'code' })
  type: 'code' | 'webhook' | 'human' | 'external';

  @Column({ type: 'varchar', length: 512, nullable: true })
  webhookUrl: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  webhookSecret: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
// Note: appended by webhook-gamer patch
