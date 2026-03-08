import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  title: string;

  @Column('text')
  description: string;

  @Column('int')
  timeLimit: number;

  @Column('int')
  memoryLimit: number;

  @Column('int', { comment: '玩家数量', default: 2 })
  gamerQuantity: number;

  @Column('boolean', { default: true })
  disabled: boolean;

  @Column('text', { select: false })
  judgerCode: string;

  @Column('varchar', { select: false })
  judgerLanguage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
