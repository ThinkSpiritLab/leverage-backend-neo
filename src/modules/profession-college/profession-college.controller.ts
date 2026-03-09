import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProfessionCollegeService } from './profession-college.service';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';
import { MergeCollegeDto } from './dto/merge-college.dto';
import { MergeProfessionDto } from './dto/merge-profession.dto';

@ApiTags('profession-college')
@ApiBearerAuth()
@Controller('profession-college')
export class ProfessionCollegeController {
  constructor(private readonly service: ProfessionCollegeService) {}

  // ─── College ────────────────────────────────────────────────────────────────

  @Get('colleges')
  @ApiOperation({ summary: '学院列表' })
  findAllColleges() {
    return this.service.findAllColleges();
  }

  @Post('colleges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '创建学院' })
  createCollege(@Body() dto: CreateCollegeDto) {
    return this.service.createCollege(dto);
  }

  @Patch('colleges/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '更新学院' })
  updateCollege(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCollegeDto,
  ) {
    return this.service.updateCollege(id, dto);
  }

  @Delete('colleges/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '删除学院' })
  removeCollege(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeCollege(id);
  }

  @Post('colleges/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '合并学院（将多个学院合并到目标学院）' })
  mergeCollege(@Body() dto: MergeCollegeDto) {
    return this.service.mergeCollege(dto.from, dto.to);
  }

  // ─── Profession ──────────────────────────────────────────────────────────────

  @Get('professions')
  @ApiOperation({ summary: '专业列表' })
  findAllProfessions(@Query('college') college?: string) {
    return this.service.findAllProfessions(college);
  }

  @Post('professions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '创建专业' })
  createProfession(@Body() dto: CreateProfessionDto) {
    return this.service.createProfession(dto);
  }

  @Patch('professions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '更新专业' })
  updateProfession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfessionDto,
  ) {
    return this.service.updateProfession(id, dto);
  }

  @Delete('professions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '删除专业' })
  removeProfession(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeProfession(id);
  }

  @Post('professions/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: '合并专业（将多个专业合并到目标专业）' })
  mergeProfession(@Body() dto: MergeProfessionDto) {
    return this.service.mergeProfession(dto.from, dto.to);
  }
}
