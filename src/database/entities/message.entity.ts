import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { User } from './user.entity'

/**
 * 站内信实体
 * 兼容原版 schema：sessionId=null 为根消息，sessionId 指向根消息 id 表示回复
 */
@Entity('message')
export class Message {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  senderId: number

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderId' })
  sender: User | null

  /**
   * 可为 null（回复时根据 session 推导）
   */
  @Column({ nullable: true })
  receiverId: number | null

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receiverId' })
  receiver: User | null

  /**
   * null = 根消息；非 null = 指向根消息 id 的回复
   */
  @Column({ nullable: true })
  sessionId: number | null

  /**
   * 消息内容（根消息中视为标题/摘要）
   */
  @Column('text')
  content: string

  /**
   * 是否已读
   */
  @Column({ default: false })
  read: boolean

  /**
   * 会话是否已关闭（仅根消息有意义）
   */
  @Column('boolean', { nullable: true, default: false })
  closed: boolean | null

  /**
   * 是否已删除（软删除）
   */
  @Column('boolean', { nullable: true, default: false })
  deleted: boolean | null

  /**
   * 会话最后更新时间（有新回复时更新根消息此字段）
   */
  @Column({ type: 'datetime' })
  messageUpdatedAt: Date

  @CreateDateColumn()
  createdAt: Date
}
