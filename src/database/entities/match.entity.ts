import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Match {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  gameId: number;

  @ManyToOne('Game', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gameId' })
  game: any;

  @Column('int', { default: 0 })
  status: number;

  @Column('varchar', { length: 128, nullable: true })
  externalJobId: string | null;

  @Column('mediumtext', { nullable: true })
  result: string;

  @Column('simple-array', { nullable: true })
  score: string[];

  @OneToMany('MatchGamerLink', (link: { match: Match }) => link.match, {
    cascade: ['insert'],
  })
  links: any[];

  @Column({ type: 'tinyint', default: 0, comment: '测试对局不计ELO' })
  isTest: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
