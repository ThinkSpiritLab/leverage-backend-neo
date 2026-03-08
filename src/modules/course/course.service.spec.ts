import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Course } from '../../database/entities/course.entity'
import { CourseUser } from '../../database/entities/course-user.entity'
import { CourseProblem } from '../../database/entities/course-problem.entity'
import { Submission } from '../../database/entities/submission.entity'
import { User } from '../../database/entities/user.entity'
import { CourseService, parseFilters } from './course.service'

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
})

describe('parseFilters (filter-sheet #50 fix)', () => {
  describe('精确匹配', () => {
    it('exportSubmissions: 精确匹配正确（纯数字）', () => {
      const filters = parseFilters('2021001001')
      expect(filters).toHaveLength(1)
      expect(typeof filters[0]).toBe('string')
      expect(filters[0]).toBe('2021001001')
    })

    it('多个精确匹配', () => {
      const filters = parseFilters('2021001001\n2021001002')
      expect(filters).toHaveLength(2)
      expect(filters[0]).toBe('2021001001')
      expect(filters[1]).toBe('2021001002')
    })
  })

  describe('学号段范围过滤（#50 rangeMatch 用 line）', () => {
    it('exportSubmissions: 学号段过滤正确（rangeMatch 用 line 不用 filtersText）', () => {
      const filters = parseFilters('2021001001-2021001010')
      expect(filters).toHaveLength(1)
      expect(typeof filters[0]).toBe('function')

      const fn = filters[0] as (s: string) => boolean
      // 范围内的应该匹配
      expect(fn('2021001001')).toBe(true)
      expect(fn('2021001005')).toBe(true)
      expect(fn('2021001010')).toBe(true)
      // 范围外的不应该匹配
      expect(fn('2021001000')).toBe(false)
      expect(fn('2021001011')).toBe(false)
    })

    it('范围过滤（简单数字范围）', () => {
      const filters = parseFilters('100-200')
      const fn = filters[0] as (s: string) => boolean
      expect(fn('100')).toBe(true)
      expect(fn('150')).toBe(true)
      expect(fn('200')).toBe(true)
      expect(fn('99')).toBe(false)
      expect(fn('201')).toBe(false)
    })

    it('多行混合：精确 + 范围', () => {
      const filters = parseFilters('2021001001\n2021002001-2021002010')
      expect(filters).toHaveLength(2)
      expect(typeof filters[0]).toBe('string')
      expect(typeof filters[1]).toBe('function')

      const fn = filters[1] as (s: string) => boolean
      expect(fn('2021002005')).toBe(true)
      expect(fn('2021001001')).toBe(false) // 不在范围内
    })
  })

  describe('正则表达式过滤', () => {
    it('exportSubmissions: 正则匹配正确', () => {
      const filters = parseFilters('2021.*')
      expect(filters).toHaveLength(1)
      expect(typeof filters[0]).toBe('function')

      const fn = filters[0] as (s: string) => boolean
      expect(fn('2021001001')).toBe(true)
      expect(fn('2021abcdef')).toBe(true)
      expect(fn('2022001001')).toBe(false)
    })

    it('正则表达式：前缀匹配', () => {
      const filters = parseFilters('^2021')
      const fn = filters[0] as (s: string) => boolean
      expect(fn('2021001001')).toBe(true)
      expect(fn('20212345')).toBe(true)
      expect(fn('2022001001')).toBe(false)
    })
  })

  describe('空输入', () => {
    it('空字符串返回空数组', () => {
      const filters = parseFilters('')
      expect(filters).toEqual([])
    })
  })

  describe('#50 回归测试', () => {
    it('验证 rangeMatch 使用循环变量 line，不是 filtersText', () => {
      // 模拟原有 bug 的场景：filtersText 包含换行符，如果 rangeMatch 用 filtersText 则不能正确匹配
      // 正确行为：每行独立解析，"100-200" 行应被识别为范围过滤
      const filtersText = '99\n100-200\n301'
      const filters = parseFilters(filtersText)

      expect(filters).toHaveLength(3)
      expect(filters[0]).toBe('99')          // 精确匹配
      expect(typeof filters[1]).toBe('function')  // 范围函数
      expect(filters[2]).toBe('301')         // 精确匹配

      const rangeFn = filters[1] as (s: string) => boolean
      expect(rangeFn('100')).toBe(true)
      expect(rangeFn('150')).toBe(true)
      expect(rangeFn('200')).toBe(true)
      expect(rangeFn('99')).toBe(false)
      expect(rangeFn('201')).toBe(false)
    })
  })
})

describe('CourseService', () => {
  let service: CourseService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: getRepositoryToken(Course), useFactory: mockRepo },
        { provide: getRepositoryToken(CourseUser), useFactory: mockRepo },
        { provide: getRepositoryToken(CourseProblem), useFactory: mockRepo },
        { provide: getRepositoryToken(Submission), useFactory: mockRepo },
        { provide: getRepositoryToken(User), useFactory: mockRepo },
      ],
    }).compile()

    service = module.get<CourseService>(CourseService)
  })

  it('service should be defined', () => {
    expect(service).toBeDefined()
  })
})
