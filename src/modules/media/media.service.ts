import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { Media } from '../../database/entities/media.entity';
import { ConfigService } from '@nestjs/config';

export interface MediaQuery {
  page?: number;
  perPage?: number;
}

@Injectable()
export class MediaService {
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepo: Repository<Media>,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = configService.get<string>(
      'upload.dir',
      '/tmp/uploads/media',
    );
    // 确保目录存在
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * 上传文件并保存记录
   */
  async upload(file: Express.Multer.File, _userId: number): Promise<Media> {
    // 计算 MD5 hash 作为 ID
    const md5 = createHash('md5');
    md5.update(file.buffer);
    const hash = md5.digest('hex');
    const id = hash.substring(0, 7);

    // 检查是否已存在
    const existing = await this.mediaRepo.findOne({ where: { id } });
    if (existing) return existing;

    // 保存文件
    const filePath = path.join(this.uploadDir, hash);
    fs.writeFileSync(filePath, file.buffer);

    // 保存数据库记录
    const media = this.mediaRepo.create({
      id,
      originalName: file.originalname,
    });
    return this.mediaRepo.save(media);
  }

  /**
   * 获取媒体文件列表（分页）
   */
  async findAll(query: MediaQuery): Promise<{ items: Media[]; total: number }> {
    const page = query.page ?? 1;
    const perPage = Math.min(query.perPage ?? 20, 100);

    const [items, total] = await this.mediaRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return { items, total };
  }

  /**
   * 删除媒体文件
   */
  async remove(id: string): Promise<void> {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) throw new NotFoundException(`媒体文件 #${id} 不存在`);

    await this.mediaRepo.delete(id);
    // 尝试删除实际文件（忽略失败）
    try {
      const files = fs.readdirSync(this.uploadDir);
      const matchFile = files.find((f) => f.startsWith(id));
      if (matchFile) {
        fs.unlinkSync(path.join(this.uploadDir, matchFile));
      }
    } catch {
      // ignore
    }
  }

  /**
   * 获取文件访问 URL
   */
  async getUrl(id: string): Promise<{ url: string }> {
    const media = await this.mediaRepo.findOne({ where: { id } });
    if (!media) throw new NotFoundException(`媒体文件 #${id} 不存在`);
    return { url: `/media/${id}` };
  }
}
