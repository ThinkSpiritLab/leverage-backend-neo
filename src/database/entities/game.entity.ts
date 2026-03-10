import {
  AfterLoad,
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

  /** 前端兼容别名，响应中 name === title */
  name?: string;

  @AfterLoad()
  setName() {
    this.name = this.title;
  }

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

  @Column('text', { nullable: true })
  rendererHtml?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
