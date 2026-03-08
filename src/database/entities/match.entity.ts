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

  @Column('mediumtext', { nullable: true })
  result: string;

  @Column('simple-array', { nullable: true })
  score: string[];

  @OneToMany('MatchGamerLink', (link: any) => link.match, {
    cascade: ['insert'],
  })
  links: any[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
