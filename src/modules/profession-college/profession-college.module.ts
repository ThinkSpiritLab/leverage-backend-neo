import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { College } from '../../database/entities/college.entity'
import { Profession } from '../../database/entities/profession.entity'
import { AuthModule } from '../auth/auth.module'
import { ProfessionCollegeController } from './profession-college.controller'
import { ProfessionCollegeService } from './profession-college.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([College, Profession]),
    AuthModule,
  ],
  controllers: [ProfessionCollegeController],
  providers: [ProfessionCollegeService],
  exports: [ProfessionCollegeService],
})
export class ProfessionCollegeModule {}
