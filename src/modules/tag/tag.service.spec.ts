import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TagService } from './tag.service';
import { Tag } from '../../database/entities/tag.entity';

describe('TagService', () => {
  let service: TagService;
  let tagRepo: any;

  const mockTag: Tag = {
    id: 1,
    name: '动态规划',
    parent: null as any,
    children: [],
  } as any;

  beforeEach(async () => {
    tagRepo = {
      findTrees: jest.fn().mockResolvedValue([mockTag]),
      findOne: jest.fn().mockResolvedValue(mockTag),
      create: jest.fn().mockReturnValue({ name: '新标签' }),
      save: jest.fn().mockResolvedValue(mockTag),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagService,
        { provide: getRepositoryToken(Tag), useValue: tagRepo },
      ],
    }).compile();

    service = module.get<TagService>(TagService);
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('应该返回所有标签（树形结构）', async () => {
      const result = await service.findAll();
      expect(tagRepo.findTrees).toHaveBeenCalled();
      expect(result).toEqual([mockTag]);
    });

    it('无标签时返回空数组', async () => {
      tagRepo.findTrees.mockResolvedValue([]);
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('应该创建一个没有父标签的标签', async () => {
      tagRepo.create.mockReturnValue({ name: '贪心' });
      tagRepo.save.mockResolvedValue({ id: 2, name: '贪心' });

      const result = await service.create({ name: '贪心' });

      expect(tagRepo.create).toHaveBeenCalledWith({ name: '贪心' });
      expect(tagRepo.save).toHaveBeenCalled();
      expect(result).toEqual({ id: 2, name: '贪心' });
    });

    it('传入 parentId 时应该关联父标签', async () => {
      const parentTag = { id: 1, name: '算法' };
      tagRepo.findOne.mockResolvedValue(parentTag);
      const newTag: any = { name: '二分' };
      tagRepo.create.mockReturnValue(newTag);
      tagRepo.save.mockImplementation(async (t: any) => ({ ...t, id: 3 }));

      const result = await service.create({ name: '二分', parentId: 1 });

      expect(tagRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(newTag.parent).toBe(parentTag);
      expect(result.id).toBe(3);
    });

    it('父标签不存在时应该抛出 NotFoundException', async () => {
      tagRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ name: '二分', parentId: 999 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('应该更新标签名称', async () => {
      const tag: any = { id: 1, name: '旧名' };
      tagRepo.findOne.mockResolvedValue(tag);
      tagRepo.save.mockImplementation(async (t: any) => t);

      const result = await service.update(1, { name: '新名' });

      expect(tag.name).toBe('新名');
      expect(tagRepo.save).toHaveBeenCalledWith(tag);
    });

    it('标签不存在时应该抛出 NotFoundException', async () => {
      tagRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: '新名' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('应该更新父标签', async () => {
      const tag: any = { id: 2, name: '二分', parent: null };
      const parentTag = { id: 1, name: '算法' };
      tagRepo.findOne
        .mockResolvedValueOnce(tag) // 查 id=2 的 tag
        .mockResolvedValueOnce(parentTag); // 查 parentId=1 的 parent
      tagRepo.save.mockImplementation(async (t: any) => t);

      await service.update(2, { name: '二分', parentId: 1 });

      expect(tag.parent).toBe(parentTag);
    });

    it('parentId=null 时应该清除父标签', async () => {
      const tag: any = { id: 2, name: '二分', parent: { id: 1 } };
      tagRepo.findOne.mockResolvedValue(tag);
      tagRepo.save.mockImplementation(async (t: any) => t);

      await service.update(2, { name: '二分', parentId: null });

      expect(tag.parent).toBeNull();
    });

    it('新父标签不存在时应该抛出 NotFoundException', async () => {
      const tag: any = { id: 2, name: '二分', parent: null };
      tagRepo.findOne
        .mockResolvedValueOnce(tag) // 查 tag
        .mockResolvedValueOnce(null); // 查 parent 不存在

      await expect(
        service.update(2, { name: '二分', parentId: 999 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('应该删除存在的标签', async () => {
      tagRepo.findOne.mockResolvedValue(mockTag);

      await service.remove(1);

      expect(tagRepo.remove).toHaveBeenCalledWith(mockTag);
    });

    it('标签不存在时应该抛出 NotFoundException', async () => {
      tagRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
