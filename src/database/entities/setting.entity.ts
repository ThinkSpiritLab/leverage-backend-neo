import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity()
export class Setting {
  @PrimaryColumn()
  key: string

  @Column('varchar', { name: 'value', default: '', length: 1024 })
  valueString: string

  @Column('varchar', { default: '' })
  note: string

  @Column('text')
  type: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
