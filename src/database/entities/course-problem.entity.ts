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
export class CourseProblem {
  @PrimaryColumn()
  courseId: number;

  @ManyToOne('Course', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'courseId' })
  course: any;

  @PrimaryColumn()
  problemId: number;

  @Index()
  @ManyToOne('Problem', { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problemId' })
  problem: any;

  @Column('int', { comment: '提交数', default: 0 })
  submits: number;

  @Column('int', { comment: '通过数', default: 0 })
  accepts: number;

  @Column('int', { comment: '查重阈值', default: 0 })
  threshold: number;

  @Column('int', { default: 1 })
  weight: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
