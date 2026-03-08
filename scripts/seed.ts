/* eslint-disable no-console */
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.resolve(__dirname, '../.env') })

// Must import after config() so env vars are set
import { hashPassword } from '../src/common/utils/crypto.util'
import { User } from '../src/database/entities/user.entity'
import { Problem, ProblemStatus } from '../src/database/entities/problem.entity'
import { Contest } from '../src/database/entities/contest.entity'
import { Course } from '../src/database/entities/course.entity'
import { Tag } from '../src/database/entities/tag.entity'
import { ContestProblem } from '../src/database/entities/contest-problem.entity'
import { CourseProblem } from '../src/database/entities/course-problem.entity'

const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '3306', 10),
  database: process.env.DB_DATABASE,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  entities: [path.resolve(__dirname, '../src/database/entities/*.entity.ts')],
  synchronize: false,
})

// ── Problem content (Markdown) ───────────────────────────────────────────────

const SEED_PROBLEMS: Array<{
  logicId: number
  title: string
  timeLimit: number
  memoryLimit: number
  difficulty: number
  content: string
  source: string
  tagNames: string[]
}> = [
  {
    logicId: 1001,
    title: 'A+B Problem',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 1,
    source: 'SEED',
    tagNames: [],
    content: `## 题目描述

给定两个整数 A 和 B，求 A + B 的值。

## 输入格式

一行，包含两个整数 A 和 B（-1000 ≤ A, B ≤ 1000）。

## 输出格式

一行，输出 A + B 的值。

## 样例输入

\`\`\`
1 2
\`\`\`

## 样例输出

\`\`\`
3
\`\`\`

## 提示

本题为入门题，直接读入两数求和即可。`,
  },
  {
    logicId: 1002,
    title: '斐波那契数列',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 2,
    source: 'SEED',
    tagNames: ['动态规划'],
    content: `## 题目描述

给定正整数 n，求第 n 个斐波那契数。定义如下：F(1) = 1，F(2) = 1，F(n) = F(n-1) + F(n-2)。

## 输入格式

一行，包含一个正整数 n（1 ≤ n ≤ 40）。

## 输出格式

一行，输出第 n 个斐波那契数。

## 样例输入

\`\`\`
10
\`\`\`

## 样例输出

\`\`\`
55
\`\`\`

## 提示

可以使用递推或递归方法求解，注意 n ≤ 40 时结果不会溢出 int。`,
  },
  {
    logicId: 1003,
    title: '快速排序',
    timeLimit: 2000,
    memoryLimit: 256,
    difficulty: 3,
    source: 'SEED',
    tagNames: [],
    content: `## 题目描述

给定 n 个整数，请将它们从小到大排序后输出。

## 输入格式

第一行：一个正整数 n（1 ≤ n ≤ 100000）。

第二行：n 个整数，每个整数的绝对值不超过 10^9，以空格分隔。

## 输出格式

一行，输出排序后的 n 个整数，以空格分隔。

## 样例输入

\`\`\`
5
3 1 4 1 5
\`\`\`

## 样例输出

\`\`\`
1 1 3 4 5
\`\`\`

## 提示

可以使用标准库的排序函数（如 C++ 的 std::sort）实现。`,
  },
  {
    logicId: 1004,
    title: '字符串反转',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 1,
    source: 'SEED',
    tagNames: ['字符串'],
    content: `## 题目描述

给定一个字符串，请将其反转后输出。

## 输入格式

一行，包含一个字符串 S（1 ≤ |S| ≤ 1000，仅包含可见 ASCII 字符）。

## 输出格式

一行，输出反转后的字符串。

## 样例输入

\`\`\`
hello
\`\`\`

## 样例输出

\`\`\`
olleh
\`\`\``,
  },
  {
    logicId: 1005,
    title: '最短路径',
    timeLimit: 2000,
    memoryLimit: 256,
    difficulty: 4,
    source: 'SEED',
    tagNames: ['图论'],
    content: `## 题目描述

给定一个有向带权图，包含 n 个节点和 m 条边，使用 Dijkstra 算法求从源点 s 到所有其他节点的最短路径长度。

## 输入格式

第一行：三个整数 n、m、s（1 ≤ n ≤ 10000，1 ≤ m ≤ 100000，1 ≤ s ≤ n）。

接下来 m 行：每行三个整数 u、v、w，表示从节点 u 到节点 v 有一条权重为 w 的有向边（1 ≤ w ≤ 10000）。

## 输出格式

n 行，第 i 行输出从 s 到节点 i 的最短路径长度。若不可达，输出 -1。

## 样例输入

\`\`\`
4 5 1
1 2 2
1 3 6
2 3 3
2 4 7
3 4 1
\`\`\`

## 样例输出

\`\`\`
0
2
5
6
\`\`\`

## 提示

使用优先队列（堆）优化的 Dijkstra 算法，时间复杂度 O((n + m) log n)。`,
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function upsertUser(
  repo: import('typeorm').Repository<User>,
  username: string,
  password: string,
  authority: string,
  nickname: string,
): Promise<User> {
  const existing = await repo.findOne({ where: { username } })
  if (existing) {
    console.log(`  - 用户 ${username} 已存在，跳过`)
    return existing
  }
  const entity: Partial<User> = {
    username,
    passwordHash: hashPassword(password),
    authority,
    nickname,
  }
  const saved = await repo.save(entity as User)
  console.log(`  ✓ 创建用户 ${username}`)
  return saved
}

async function upsertTag(
  repo: import('typeorm').Repository<Tag>,
  name: string,
): Promise<Tag> {
  const existing = await repo.findOne({ where: { name } })
  if (existing) {
    console.log(`  - 标签「${name}」已存在，跳过`)
    return existing
  }
  const saved = await repo.save({ name } as Tag)
  console.log(`  ✓ 创建标签「${name}」`)
  return saved
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 开始注入种子数据...')
  await AppDataSource.initialize()
  console.log('✅ 数据库连接成功\n')

  const userRepo = AppDataSource.getRepository(User)
  const problemRepo = AppDataSource.getRepository(Problem)
  const contestRepo = AppDataSource.getRepository(Contest)
  const courseRepo = AppDataSource.getRepository(Course)
  const tagRepo = AppDataSource.getRepository(Tag)
  const contestProblemRepo = AppDataSource.getRepository(ContestProblem)
  const courseProblemRepo = AppDataSource.getRepository(CourseProblem)

  // ── 1. 测试用户（user1-user10）──────────────────────────────────────────────
  console.log('👤 创建普通测试用户...')
  for (let i = 1; i <= 10; i++) {
    await upsertUser(userRepo, `user${i}`, 'Test@123456', 'user', `测试用户${i}`)
  }

  // ── 2. admin 用户 ──────────────────────────────────────────────────────────
  console.log('\n🔑 创建 admin 用户...')
  await upsertUser(userRepo, 'testadmin', 'Admin@123456', 'admin', '测试管理员')

  // ── 3. 标签 ────────────────────────────────────────────────────────────────
  console.log('\n🏷️  创建标签...')
  const tagByName: Record<string, Tag> = {}
  for (const name of ['动态规划', '图论', '字符串']) {
    tagByName[name] = await upsertTag(tagRepo, name)
  }

  // ── 4. 题目 ────────────────────────────────────────────────────────────────
  console.log('\n📝 创建题目...')
  const problems: Problem[] = []
  for (const def of SEED_PROBLEMS) {
    let problem = await problemRepo.findOne({
      where: { prefix: 'SEED', logicId: def.logicId },
    })
    if (problem) {
      console.log(`  - 题目 SEED-${def.logicId} 已存在，跳过`)
    } else {
      const tags = def.tagNames.map((n) => tagByName[n]).filter(Boolean)
      const entity: Partial<Problem> = {
        prefix: 'SEED',
        logicId: def.logicId,
        title: def.title,
        content: def.content,
        source: def.source,
        timeLimit: def.timeLimit,
        memoryLimit: def.memoryLimit,
        difficulty: def.difficulty,
        status: ProblemStatus.ACCEPTED,
        closed: false,
        restricted: false,
        cases: 1,
        multiCases: false,
        tags: tags as any,
      }
      problem = await problemRepo.save(entity as Problem)
      console.log(`  ✓ 创建题目 SEED-${def.logicId}: ${def.title}`)
    }
    problems.push(problem)
  }

  // ── 5. 竞赛（含题目 1001-1003）────────────────────────────────────────────
  console.log('\n🏆 创建竞赛...')
  const contestName = 'SEED 测试竞赛'
  let contest = await contestRepo.findOne({ where: { name: contestName } })
  if (contest) {
    console.log(`  - 竞赛「${contestName}」已存在，跳过`)
  } else {
    const now = new Date()
    const entity: Partial<Contest> = {
      name: contestName,
      description: '由种子数据脚本创建的测试竞赛，包含题目 SEED-1001 至 SEED-1003。',
      type: 'contest',
      startTime: new Date(now.getTime() + 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      public: true,
      openForRegistration: true,
      allowDirectLogin: false,
      penalty: 20,
      freezeTime: 0,
      freezeTimeAfterEnd: 0,
      fullyFreeze: false,
      scoreByPoint: false,
    }
    contest = await contestRepo.save(entity as Contest)
    console.log(`  ✓ 创建竞赛「${contestName}」(id=${contest.id})`)

    const labels = ['A', 'B', 'C']
    for (let i = 0; i < 3; i++) {
      const cp: Partial<ContestProblem> = {
        contestId: contest.id,
        problemId: problems[i].id,
        label: labels[i],
        weight: 100,
      }
      await contestProblemRepo.save(cp as ContestProblem)
      console.log(`    ↳ 关联 SEED-${problems[i].logicId} → 标签 ${labels[i]}`)
    }
  }

  // ── 6. 课程（含全部 5 道题）────────────────────────────────────────────────
  console.log('\n📚 创建课程...')
  const courseName = 'SEED 测试课程'
  let course = await courseRepo.findOne({ where: { name: courseName } })
  if (course) {
    console.log(`  - 课程「${courseName}」已存在，跳过`)
  } else {
    const now = new Date()
    const entity: Partial<Course> = {
      name: courseName,
      teacher: 'SEED Bot',
      notification: '由种子数据脚本创建的测试课程，包含全部 5 道 SEED 题目。',
      startTime: now,
      endTime: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      type: 0,
      archived: false,
      scoreByPoint: false,
    }
    course = await courseRepo.save(entity as Course)
    console.log(`  ✓ 创建课程「${courseName}」(id=${course.id})`)

    for (let i = 0; i < problems.length; i++) {
      const cp: Partial<CourseProblem> = {
        courseId: course.id,
        problemId: problems[i].id,
        weight: i + 1,
      }
      await courseProblemRepo.save(cp as CourseProblem)
      console.log(`    ↳ 关联 SEED-${problems[i].logicId}`)
    }
  }

  await AppDataSource.destroy()
  console.log('\n🎉 种子数据注入完成！')
  console.log('\n📋 测试账号：')
  console.log('  普通用户: user1-user10 / Test@123456')
  console.log('  管理员:   testadmin / Admin@123456')
}

main().catch((err) => {
  console.error('❌ 种子数据注入失败：', err)
  process.exit(1)
})
