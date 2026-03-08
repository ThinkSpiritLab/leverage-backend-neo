import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { SettingService } from './setting.service'
import { Setting } from '../../database/entities/setting.entity'

describe('SettingService', () => {
  let service: SettingService
  let settingRepo: any

  beforeEach(async () => {
    settingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingService,
        { provide: getRepositoryToken(Setting), useValue: settingRepo },
      ],
    }).compile()

    service = module.get<SettingService>(SettingService)
  })

  // ─── get ─────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('配置存在时返回 valueString', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'siteName', valueString: 'Leverage OJ' })
      const result = await service.get('siteName')
      expect(result).toBe('Leverage OJ')
    })

    it('配置不存在时返回 null', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      const result = await service.get('missing')
      expect(result).toBeNull()
    })
  })

  // ─── set ─────────────────────────────────────────────────────────────────

  describe('set', () => {
    it('应该调用 upsert 写入配置', async () => {
      await service.set('siteName', 'MyOJ')
      expect(settingRepo.upsert).toHaveBeenCalledWith(
        { key: 'siteName', valueString: 'MyOJ', type: 'string' },
        ['key'],
      )
    })
  })

  // ─── getNumber ────────────────────────────────────────────────────────────

  describe('getNumber', () => {
    it('配置存在时返回数值', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'maxSubmitPerMin', valueString: '20' })
      const result = await service.getNumber('maxSubmitPerMin')
      expect(result).toBe(20)
    })

    it('配置不存在时返回 defaultValue', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      const result = await service.getNumber('missing', 10)
      expect(result).toBe(10)
    })

    it('defaultValue 未传时返回 0', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      const result = await service.getNumber('missing')
      expect(result).toBe(0)
    })

    it('无法解析为数值时返回 defaultValue', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'bad', valueString: 'notanumber' })
      const result = await service.getNumber('bad', 5)
      expect(result).toBe(5)
    })

    it('空字符串时返回 defaultValue', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'empty', valueString: '' })
      const result = await service.getNumber('empty', 7)
      expect(result).toBe(7)
    })
  })

  // ─── setNumber ────────────────────────────────────────────────────────────

  describe('setNumber', () => {
    it('应该将数字转为字符串后调用 upsert', async () => {
      await service.setNumber('maxSubmitPerMin', 15)
      expect(settingRepo.upsert).toHaveBeenCalledWith(
        { key: 'maxSubmitPerMin', valueString: '15', type: 'number' },
        ['key'],
      )
    })
  })

  // ─── getBoolean ───────────────────────────────────────────────────────────

  describe('getBoolean', () => {
    it('"true" 返回 true', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'showSubmission', valueString: 'true' })
      expect(await service.getBoolean('showSubmission')).toBe(true)
    })

    it('"1" 返回 true', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'showSubmission', valueString: '1' })
      expect(await service.getBoolean('showSubmission')).toBe(true)
    })

    it('"false" 返回 false', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'showSubmission', valueString: 'false' })
      expect(await service.getBoolean('showSubmission')).toBe(false)
    })

    it('配置不存在时返回 defaultValue', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      expect(await service.getBoolean('missing', true)).toBe(true)
    })

    it('defaultValue 未传时返回 false', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      expect(await service.getBoolean('missing')).toBe(false)
    })
  })

  // ─── getAll ───────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('应该返回所有配置', async () => {
      const settings = [
        { key: 'siteName', valueString: 'Leverage' },
        { key: 'showSubmission', valueString: 'true' },
      ]
      settingRepo.find.mockResolvedValue(settings)
      const result = await service.getAll()
      expect(result).toBe(settings)
    })

    it('无配置时返回空数组', async () => {
      settingRepo.find.mockResolvedValue([])
      const result = await service.getAll()
      expect(result).toEqual([])
    })
  })

  // ─── getPublic ────────────────────────────────────────────────────────────

  describe('getPublic', () => {
    it('应该返回公开配置的键值映射', async () => {
      const settings = [
        { key: 'siteName', valueString: 'Leverage OJ' },
        { key: 'showSubmission', valueString: 'true' },
      ]
      settingRepo.find.mockResolvedValue(settings)

      const result = await service.getPublic()
      expect(result).toEqual({
        siteName: 'Leverage OJ',
        showSubmission: 'true',
      })
    })

    it('无公开配置时返回空对象', async () => {
      settingRepo.find.mockResolvedValue([])
      const result = await service.getPublic()
      expect(result).toEqual({})
    })
  })

  // ─── 快捷方法 ─────────────────────────────────────────────────────────────

  describe('isShowSubmission', () => {
    it('配置为 true 时返回 true', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'showSubmission', valueString: 'true' })
      expect(await service.isShowSubmission()).toBe(true)
    })

    it('配置不存在时默认返回 true', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      expect(await service.isShowSubmission()).toBe(true)
    })
  })

  describe('getMaxSubmitPerMin', () => {
    it('配置存在时返回正确数值', async () => {
      settingRepo.findOne.mockResolvedValue({ key: 'maxSubmitPerMin', valueString: '20' })
      expect(await service.getMaxSubmitPerMin()).toBe(20)
    })

    it('配置不存在时默认返回 10', async () => {
      settingRepo.findOne.mockResolvedValue(null)
      expect(await service.getMaxSubmitPerMin()).toBe(10)
    })
  })
})
