import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { College } from '../../database/entities/college.entity';
import { Profession } from '../../database/entities/profession.entity';
import { User } from '../../database/entities/user.entity';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
import { CreateProfessionDto } from './dto/create-profession.dto';
import { UpdateProfessionDto } from './dto/update-profession.dto';

@Injectable()
export class ProfessionCollegeService {
  constructor(
    @InjectRepository(College)
    private readonly collegeRepo: Repository<College>,
    @InjectRepository(Profession)
    private readonly professionRepo: Repository<Profession>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ─── College ────────────────────────────────────────────────────────────────

  findAllColleges(): Promise<College[]> {
    return this.collegeRepo.find({ order: { college: 'ASC' } });
  }

  async createCollege(dto: CreateCollegeDto): Promise<College> {
    const exists = await this.collegeRepo.findOne({
      where: { college: dto.college },
    });
    if (exists) throw new ConflictException('学院已存在');
    return this.collegeRepo.save(this.collegeRepo.create(dto));
  }

  async updateCollege(id: number, dto: UpdateCollegeDto): Promise<College> {
    const college = await this.collegeRepo.findOne({ where: { id } });
    if (!college) throw new NotFoundException('学院不存在');
    const oldName = college.college;
    Object.assign(college, dto);
    const [saved] = await Promise.all([
      this.collegeRepo.save(college),
      this.userRepo.update({ college: oldName }, { college: dto.college }),
      this.professionRepo.update(
        { college: oldName },
        { college: dto.college },
      ),
    ]);
    return saved;
  }

  async removeCollege(id: number): Promise<void> {
    const college = await this.collegeRepo.findOne({ where: { id } });
    if (!college) throw new NotFoundException('学院不存在');
    await this.collegeRepo.remove(college);
  }

  async mergeCollege(from: number[], to: number): Promise<void> {
    const fromSet = new Set(from.filter((id) => id !== to));
    const [fromColleges, toCollege] = await Promise.all([
      this.collegeRepo.findBy({ id: In([...fromSet]) }),
      this.collegeRepo.findOne({ where: { id: to } }),
    ]);
    if (!toCollege) throw new NotFoundException('目标学院不存在');

    const fromNames = fromColleges.map((c) => c.college);
    const toName = toCollege.college;

    // Merge professions: copy unique ones to target, delete source ones
    const [professionsFrom, professionsTo] = await Promise.all([
      this.professionRepo.find({ where: { college: In(fromNames) } }),
      this.professionRepo.find({ where: { college: toName } }),
    ]);
    const existingNames = new Set(professionsTo.map((p) => p.profession));
    const toCreate = professionsFrom
      .filter((p) => !existingNames.has(p.profession))
      .map((p) =>
        this.professionRepo.create({
          college: toName,
          profession: p.profession,
        }),
      );

    await Promise.all([
      toCreate.length ? this.professionRepo.save(toCreate) : Promise.resolve(),
      this.professionRepo.delete({ college: In(fromNames) }),
      this.userRepo.update({ college: In(fromNames) }, { college: toName }),
      this.collegeRepo.delete({ college: In(fromNames) }),
    ]);
  }

  // ─── Profession ──────────────────────────────────────────────────────────────

  findAllProfessions(college?: string): Promise<Profession[]> {
    return college
      ? this.professionRepo.find({
          where: { college },
          order: { profession: 'ASC' },
        })
      : this.professionRepo.find({
          order: { college: 'ASC', profession: 'ASC' },
        });
  }

  async createProfession(dto: CreateProfessionDto): Promise<Profession> {
    const exists = await this.professionRepo.findOne({
      where: { college: dto.college, profession: dto.profession },
    });
    if (exists) throw new ConflictException('专业已存在');
    return this.professionRepo.save(this.professionRepo.create(dto));
  }

  async updateProfession(
    id: number,
    dto: UpdateProfessionDto,
  ): Promise<Profession> {
    const profession = await this.professionRepo.findOne({ where: { id } });
    if (!profession) throw new NotFoundException('专业不存在');
    const oldProfession = profession.profession;
    const oldCollege = profession.college;
    Object.assign(profession, dto);
    const [saved] = await Promise.all([
      this.professionRepo.save(profession),
      this.userRepo.update(
        { profession: oldProfession, college: oldCollege },
        { profession: profession.profession, college: profession.college },
      ),
    ]);
    return saved;
  }

  async removeProfession(id: number): Promise<void> {
    const profession = await this.professionRepo.findOne({ where: { id } });
    if (!profession) throw new NotFoundException('专业不存在');
    await this.professionRepo.remove(profession);
  }

  async mergeProfession(from: number[], to: number): Promise<void> {
    const fromSet = new Set(from.filter((id) => id !== to));
    const [fromProfessions, toProfession] = await Promise.all([
      this.professionRepo.findBy({ id: In([...fromSet]) }),
      this.professionRepo.findOne({ where: { id: to } }),
    ]);
    if (!toProfession) throw new NotFoundException('目标专业不存在');

    await Promise.all([
      ...fromProfessions.map((p) =>
        this.userRepo.update(
          { profession: p.profession, college: p.college },
          {
            profession: toProfession.profession,
            college: toProfession.college,
          },
        ),
      ),
      this.professionRepo.delete({ id: In([...fromSet]) }),
    ]);
  }
}
