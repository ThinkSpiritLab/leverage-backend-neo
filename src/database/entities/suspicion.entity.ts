import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm'

@Entity()
export class Suspicion {
  @PrimaryColumn()
  submissionId: number

  @OneToOne('Submission', (s: any) => s.sus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: any

  @Column({ default: 0 })
  mas0: number

  @Column({ default: 0 })
  md1: number

  @Column({ default: 0 })
  def: number

  @Column({ default: 0 })
  con: number

  @Column({ default: 0 })
  cpp: number

  @Column({ default: 0 })
  oo: number

  @Column({ default: 0 })
  cr: number

  @Column({ default: 0 })
  html: number

  @Column({ default: 0 })
  chn: number

  @Column({ default: 0 })
  qq: number

  @Column({ default: false })
  checked: boolean

  @Column('varchar', { length: 100, nullable: true })
  hashsum: string
}
