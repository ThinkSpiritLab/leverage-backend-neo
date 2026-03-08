import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm'

@Entity()
@Unique(['college', 'profession'])
export class Profession {
  @PrimaryGeneratedColumn()
  id: number

  @Column('varchar')
  profession: string

  @Column('varchar')
  college: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
