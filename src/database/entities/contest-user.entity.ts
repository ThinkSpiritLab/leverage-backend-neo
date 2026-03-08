import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class ContestUser {
  @PrimaryColumn()
  contestId: number;

  @ManyToOne('Contest', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contestId' })
  contest: any;

  @PrimaryColumn()
  userId: number;

  @Index()
  @ManyToOne('User', { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: any;

  @Column('varchar', { name: 'password', select: false, nullable: true })
  passwordHash: string | null;

  @Column('varchar', { nullable: true })
  room: string | null;

  @Column('varchar', { nullable: true })
  seat: string | null;

  @Column('int', { default: 0 })
  submits: number;

  @Column('int', { default: 0 })
  accepts: number;

  @Column('boolean', { default: false })
  wildcard: boolean;

  @Column('boolean', { default: false })
  female: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
