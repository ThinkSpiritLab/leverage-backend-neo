import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class UserApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column('int')
  userId: number;

  @ManyToOne('User')
  @JoinColumn({ name: 'userId' })
  user: any;

  @Column('varchar', { length: 50, comment: 'API Key 名称' })
  name: string;

  @Column('varchar', { length: 12, comment: '密钥前缀，用于展示识别' })
  keyPrefix: string;

  @Index({ unique: true })
  @Column('varchar', { length: 64, comment: 'SHA-256 哈希' })
  keyHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column('datetime', { nullable: true, comment: '撤销时间' })
  revokedAt: Date | null;

  @Column('datetime', { nullable: true, comment: '最后使用时间' })
  lastUsedAt: Date | null;
}
