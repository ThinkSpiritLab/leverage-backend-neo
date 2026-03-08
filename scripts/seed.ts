import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.resolve(__dirname, '../.env') })

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
  entities: [User, Problem, Contest, Course, Tag, ContestProblem, CourseProblem],
  synchronize: false,
})

// ── Problem definitions ──────────────────────────────────────────────────────

const SEED_PROBLEMS = [
  {
    logicId: 1001,
    title: 'A+B Problem',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 1,
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
    sampleInput: '1 2',
    sampleOutput: '3',
    source: 'SEED',
  },
  {
    logicId: 1002,
    title: '斐波那契数列',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 2,
    content: `## 题目描述

给定正整数 n，求第 n 个斐波那契数。斐波那契数列定义如下：

- F(1) = 1
- F(2) = 1
- F(n) = F(n-1) + F(n-2)（n > 2）

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
    sampleInput: '10',
    sampleOutput: '55',
    source: 'SEED',
  },
  {
    logicId: 1003,
    title: '快速排序',
    timeLimit: 2000,
    memoryLimit: 256,
    difficulty: 3,
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

可以使用标准库的排序函数（如 C++ 的 std::sort），也可以手动实现快速排序。`,
    sampleInput: '5\n3 1 4 1 5',
    sampleOutput: '1 1 3 4 5',
    source: 'SEED',
  },
  {
    logicId: 1004,
    title: '字符串反转',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 1,
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
\`\`\`

## 提示

可以使用语言内置的字符串反转方法，或者手动遍历。`,
    sampleInput: 'hello',
    sampleOutput: 'olleh',
    source: 'SEED',
  },
  {
    logicId: 1005,
    title: '最短路径',
    timeLimit: 2000,
    memoryLimit: 256,
    difficulty: 4,
    content: `## 题目描述

给定一个有向带权图，包含 n 个节点和 m 条边，请使用 Dijkstra 算法求从源点 s 到所有其他节点的最短路径长度。

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

使用优先队列（堆）优化的 Dijkstra 算法，时间复杂度为 O((n + m) log n)。注意初始化距离数组为无穷大。`,
    sampleInput: '4 5 1\n1 2 2\n1 3 6\n2 3 3\n2 4 7\n3 4 1',
    sampleOutput: '0\n2\n5\n6',
    source: 'SEED',
  },
]

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 开始注入种子数据...')
  await AppDataSource.initialize()
  console.log('✅ 数据库连接成功')

  const userRepo = AppDataSource.getRepository(User)
  const problemRepo = AppDataSource.getRepository(Problem)
  const contestRepo = AppDataSource.getRepository(Contest)
  const courseRepo = AppDataSource.getRepository(Course)
  const tagRepo = AppDataSource.getRepository(Tag)
  const contestProblemRepo = AppDataSource.getRepository(ContestProblem)
  const courseProblemRepo = AppDataSource.getRepository(CourseProblem)

  // ── 1. 测试用户 ────────────────────────────────────────────────────────────
  console.log('\n👤 创建测试用户...')
  const testUsers: User[] = []
  for (let i = 1; i <= 10; i++) {
    const username = `user${i}`
    let user = await userRepo.findOne({ where: { username } })
    if (!user) {
      user = userRepo.create({
        username,
        passwordHash: hashPassword('Test@123456'),
        authority: 'user',
        nickname: `测试用户${i}`,
      } as Partial<User> as any)
      user = await userRepo.save(user)
      console.log(`  ✓ 创建用户 ${username}`)
    } else {
      console.log(`  - 用户 ${username} 已存在，跳过`)
    }
    testUsers.push(user)
  }

  // ── 2. admin 用户 ──────────────────────────────────────────────────────────
  console.log('\n🔑 创建 admin 用户...')
  let adminUser = await userRepo.findOne({ where: { username: 'testadmin' } })
  if (!adminUser) {
    adminUser = userRepo.create({
      username: 'testadmin',
      passwordHash: hashPassword('Admin@123456'),
      authority: 'admin',
      nickname: '测试管理员',
    } as Partial<User> as any)
    adminUser = await userRepo.save(adminUser)
    console.log('  ✓ 创建用户 testadmin')
  } else {
    console.log('  - 用户 testadmin 已存在，跳过')
  }

  // ── 3. 标签 ────────────────────────────────────────────────────────────────
  console.log('\n🏷️  创建标签...')
  const tagNames = ['动态规划', '图论', '字符串']
  const tags: Tag[] = []
  for (const name of tagNames) {
    let tag = await tagRepo.findOne({ where: { name } })
    if (!tag) {
      tag = tagRepo.create({ name } as Partial<Tag> as any)
      tag = await tagRepo.save(tag)
      console.log(`  ✓ 创建标签「${name}」`)
    } else {
      console.log(`  - 标签「${name}」已存在，跳过`)
    }
    tags.push(tag)
  }

  const tagMap: Record<string, Tag> = {
    动态规划: tags[0],
    图论: tags[1],
    字符串: tags[2],
  }

  // ── 4. 题目 ────────────────────────────────────────────────────────────────
  console.log('\n📝 创建题目...')
  const problemTagMap: Record<number, Tag[]> = {
    1001: [],
    1002: [tagMap['动态规划']],
    1003: [],
    1004: [tagMap['字符串']],
    1005: [tagMap['图论']],
  }

  const problems: Problem[] = []
  for (const def of SEED_PROBLEMS) {
    let problem = await problemRepo.findOne({
      where: { prefix: 'SEED', logicId: def.logicId },
    })
    if (!problem) {
      problem = problemRepo.create({
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
        tags: problemTagMap[def.logicId] ?? [],
      } as Partial<Problem> as any)
      problem = await problemRepo.save(problem)
      console.log(`  ✓ 创建题目 SEED-${def.logicId}: ${def.title}`)
    } else {
      console.log(`  - 题目 SEED-${def.logicId} 已存在，跳过`)
    }
    problems.push(problem)
  }

  // ── 5. 竞赛 ────────────────────────────────────────────────────────────────
  console.log('\n🏆 创建竞赛...')
  const contestName = 'SEED 测试竞赛'
  let contest = await contestRepo.findOne({ where: { name: contestName } })
  if (!contest) {
    const now = new Date()
    const start = new Date(now.getTime() + 60 * 60 * 1000) // 1h later
    const end = new Date(now.getTime() + 3 * 60 * 60 * 1000) // 3h later

    contest = contestRepo.create({
      name: contestName,
      description: '由种子数据脚本自动创建的测试竞赛，包含题目 SEED-1001 至 SEED-1003。',
      type: 'contest',
      startTime: start,
      endTime: end,
      public: true,
      openForRegistration: true,
      allowDirectLogin: false,
      penalty: 20,
      freezeTime: 0,
      freezeTimeAfterEnd: 0,
      fullyFreeze: false,
      scoreByPoint: false,
    } as Partial<Contest> as any)
    contest = await contestRepo.save(contest)
    console.log(`  ✓ 创建竞赛「${contestName}」(id=${contest.id})`)

    // 关联题目 1001-1003（problems[0..2]）
    const labels = ['A', 'B', 'C']
    for (let i = 0; i < 3; i++) {
      const cp = contestProblemRepo.create({
        contestId: contest.id,
        problemId: problems[i].id,
        label: labels[i],
        weight: 100,
      } as Partial<ContestProblem> as any)
      await contestProblemRepo.save(cp)
      console.log(`    ↳ 关联题目 SEED-${problems[i].logicId} → 标签 ${labels[i]}`)
    }
  } else {
    console.log(`  - 竞赛「${contestName}」已存在，跳过`)
  }

  // ── 6. 课程 ────────────────────────────────────────────────────────────────
  console.log('\n📚 创建课程...')
  const courseName = 'SEED 测试课程'
  let course = await courseRepo.findOne({ where: { name: courseName } })
  if (!course) {
    const now = new Date()
    const start = new Date(now.getTime())
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30d later

    course = courseRepo.create({
      name: courseName,
      teacher: 'SEED Bot',
      notification: '由种子数据脚本自动创建的测试课程，包含全部 5 道 SEED 题目。',
      startTime: start,
      endTime: end,
      type: 0,
      archived: false,
      scoreByPoint: false,
    } as Partial<Course> as any)
    course = await courseRepo.save(course)
    console.log(`  ✓ 创建课程「${courseName}」(id=${course.id})`)

    // 关联全部 5 道题目
    for (let i = 0; i < problems.length; i++) {
      const cp = courseProblemRepo.create({
        courseId: course.id,
        problemId: problems[i].id,
        weight: i + 1,
      } as Partial<CourseProblem> as any)
      await courseProblemRepo.save(cp)
      console.log(`    ↳ 关联题目 SEED-${problems[i].logicId}`)
    }
  } else {
    console.log(`  - 课程「${courseName}」已存在，跳过`)
  }

  await AppDataSource.destroy()
  console.log('\n🎉 种子数据注入完成！')
  console.log('\n测试账号：')
  console.log('  普通用户: user1-user10 / Test@123456')
  console.log('  管理员:   testadmin / Admin@123456')
}

main().catch((err) => {
  console.error('❌ 种子数据注入失败：', err)
  process.exit(1)
})
