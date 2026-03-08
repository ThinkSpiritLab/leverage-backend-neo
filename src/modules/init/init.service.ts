import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../../database/entities/user.entity'
import { hashPassword } from '../../common/utils/crypto.util'

@Injectable()
export class InitService implements OnModuleInit {
  private readonly logger = new Logger(InitService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // SKIP_INIT=true 跳过初始化
    if (this.configService.get<boolean>('skipInit')) {
      this.logger.log('跳过初始化（SKIP_INIT=true）')
      return
    }

    const hasAdmin = await this.userRepo.findOne({ where: { authority: 'sa' } })
    if (!hasAdmin) {
      await this.createInitialAdmin()
      this.logger.log('初始化完成：创建了 sa 账号')
    }
  }

  private async createInitialAdmin(): Promise<void> {
    const username = this.configService.get<string>('init.saUsername', 'admin')
    const password = this.configService.get<string>('init.saPassword', 'Admin@123456')

    const user = this.userRepo.create({
      username,
      passwordHash: hashPassword(password),
      authority: 'sa',
      nickname: 'Super Admin',
    })

    await this.userRepo.save(user)
    this.logger.log(`已创建 sa 账号：${username}`)
  }
}
