import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { College } from '../../database/entities/college.entity'
import { Profession } from '../../database/entities/profession.entity'
import { CreateCollegeDto } from './dto/create-college.dto'
import { UpdateCollegeDto } from './dto/update-college.dto'
import { CreateProfessionDto } from './dto/create-profession.dto'
import { UpdateProfessionDto } from './dto/update-profession.dto'

@Injectable()
export class ProfessionCollegeService {
  constructor(
    @InjectRepository(College)
    private readonly collegeRepo: Repository<College>,
    @InjectRepository(Profession)
    private readonly professionRepo: Repository<Profession>,
  ) {}

  // ─── College ────────────────────────────────────────────────────────────────

  findAllColleges(): Promise<College[]> {
    return this.collegeRepo.find({ order: { college: 'ASC' } })
  }

  async createCollege(dto: CreateCollegeDto): Promise<College> {
    const exists = await this.collegeRepo.findOne({ where: { college: dto.college } })
    if (exists) throw new ConflictException('学院已存在')
    return this.collegeRepo.save(this.collegeRepo.create(dto))
  }

  async updateCollege(id: number, dto: UpdateCollegeDto): Promise<College> {
    const college = await this.collegeRepo.findOne({ where: { id } })
    if (!college) throw new NotFoundException('学院不存在')
    Object.assign(college, dto)
    return this.collegeRepo.save(college)
  }

  async removeCollege(id: number): Promise<void> {
    const college = await this.collegeRepo.findOne({ where: { id } })
    if (!college) throw new NotFoundException('学院不存在')
    await this.collegeRepo.remove(college)
  }

  // ─── Profession ──────────────────────────────────────────────────────────────

  findAllProfessions(college?: string): Promise<Profession[]> {
    return college
      ? this.professionRepo.find({ where: { college }, order: { profession: 'ASC' } })
      : this.professionRepo.find({ order: { college: 'ASC', profession: 'ASC' } })
  }

  async createProfession(dto: CreateProfessionDto): Promise<Profession> {
    const exists = await this.professionRepo.findOne({
      where: { college: dto.college, profession: dto.profession },
    })
    if (exists) throw new ConflictException('专业已存在')
    return this.professionRepo.save(this.professionRepo.create(dto))
  }

  async updateProfession(id: number, dto: UpdateProfessionDto): Promise<Profession> {
    const profession = await this.professionRepo.findOne({ where: { id } })
    if (!profession) throw new NotFoundException('专业不存在')
    Object.assign(profession, dto)
    return this.professionRepo.save(profession)
  }

  async removeProfession(id: number): Promise<void> {
    const profession = await this.professionRepo.findOne({ where: { id } })
    if (!profession) throw new NotFoundException('专业不存在')
    await this.professionRepo.remove(profession)
  }
}
