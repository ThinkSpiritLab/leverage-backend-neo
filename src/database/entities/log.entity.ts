import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class Log {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ nullable: true })
  callerId: number | null;

  @ManyToOne('User')
  @JoinColumn({ name: 'callerId' })
  caller: any | null;

  @Column('varchar', { nullable: true })
  field: string | null;

  @Column('varchar', { nullable: true })
  action: string | null;

  @Column('text', { nullable: true })
  payload: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
