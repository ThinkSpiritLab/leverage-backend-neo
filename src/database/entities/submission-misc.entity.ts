import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm'

@Entity()
export class SubmissionMisc {
  @PrimaryColumn()
  submissionId: number

  @OneToOne('Submission', (s: any) => s.misc, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: any

  @Column('text', { nullable: true })
  judgeResult?: string

  @Column('text')
  code: string

  @Column('text', { nullable: true })
  compileErrorMsg?: string
}
