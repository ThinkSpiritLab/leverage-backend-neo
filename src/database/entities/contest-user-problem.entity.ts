import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class ContestUserProblem {
  @PrimaryColumn('int', { name: 'contestUserContestId' })
  contestId: number;

  @ManyToOne('ContestUser', { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'contestUserContestId', referencedColumnName: 'contestId' },
    { name: 'contestUserUserId', referencedColumnName: 'userId' },
  ])
  contestUser: any;

  @PrimaryColumn('int', { name: 'contestUserUserId' })
  contestUserId: number;

  @PrimaryColumn('int')
  contestProblemId: number;

  @Column({ default: false })
  sent: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
