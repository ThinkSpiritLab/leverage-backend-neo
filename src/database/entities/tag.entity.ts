import { Column, Entity, PrimaryGeneratedColumn, Tree, TreeChildren, TreeParent } from 'typeorm'

@Entity()
@Tree('closure-table')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number

  @TreeParent()
  parent: Tag

  @TreeChildren()
  children: Tag[]

  @Column('varchar')
  name: string
}
