import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 40 })
  title: string;

  @Column('text')
  content: string;

  @Column('boolean', { default: false })
  deleted: boolean;

  @Column('boolean', { default: false })
  highlight: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
