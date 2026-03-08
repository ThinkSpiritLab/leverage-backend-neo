import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContestUser } from '../../database/entities/contest-user.entity'
import { Contest } from '../../database/entities/contest.entity'
import { User } from '../../database/entities/user.entity'
import { ContestAuthGuard } from '../../common/guards/contest-auth.guard'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAccessStrategy } from './strategies/jwt-access.strategy'
import { JwtContestStrategy } from './strategies/jwt-contest.strategy'
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy'

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([User, ContestUser, Contest]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.accessExpiresIn', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    JwtContestStrategy,
    // 导出 guards 供其他模块使用时注入
    JwtAuthGuard,
    RolesGuard,
    ContestAuthGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    ContestAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
