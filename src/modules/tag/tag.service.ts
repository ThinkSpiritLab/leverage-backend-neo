import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TreeRepository } from 'typeorm';
import { Tag } from '../../database/entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepo: TreeRepository<Tag>,
  ) {}

  /**
   * 获取所有标签（树形结构）
   */
  async findAll(): Promise<Tag[]> {
    return this.tagRepo.findTrees();
  }

  /**
   * 创建标签
   */
  async create(dto: CreateTagDto): Promise<Tag> {
    const tag = this.tagRepo.create({ name: dto.name });

    if (dto.parentId) {
      const parent = await this.tagRepo.findOne({
        where: { id: dto.parentId },
      });
      if (!parent)
        throw new NotFoundException(`父标签 #${dto.parentId} 不存在`);
      tag.parent = parent;
    }

    return this.tagRepo.save(tag);
  }

  /**
   * 更新标签
   */
  async update(id: number, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException(`标签 #${id} 不存在`);

    if (dto.name !== undefined) tag.name = dto.name;

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        tag.parent = null as any;
      } else {
        const parent = await this.tagRepo.findOne({
          where: { id: dto.parentId },
        });
        if (!parent)
          throw new NotFoundException(`父标签 #${dto.parentId} 不存在`);
        tag.parent = parent;
      }
    }

    return this.tagRepo.save(tag);
  }

  /**
   * 删除标签
   */
  async remove(id: number): Promise<void> {
    const tag = await this.tagRepo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException(`标签 #${id} 不存在`);
    await this.tagRepo.remove(tag);
  }
}
