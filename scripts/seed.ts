/* eslint-disable no-console */
import 'reflect-metadata'
import { DataSource, In } from 'typeorm'
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
import { ContestUser } from '../src/database/entities/contest-user.entity'
import { CourseUser } from '../src/database/entities/course-user.entity'
import { Submission } from '../src/database/entities/submission.entity'
import { SubmissionMisc } from '../src/database/entities/submission-misc.entity'
import { Notification } from '../src/database/entities/notification.entity'

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

type SeedProblem = {
  logicId: number
  title: string
  timeLimit: number
  memoryLimit: number
  difficulty: number
  cases: number
  source: string
  content: string
  tagNames: string[]
}

const SEED_TAGS: Array<{ name: string; color: string }> = [
  { name: '贪心', color: '#F59E0B' },
  { name: '动态规划', color: '#8B5CF6' },
  { name: '数学', color: '#EF4444' },
  { name: '字符串', color: '#10B981' },
  { name: '排序', color: '#3B82F6' },
  { name: '搜索', color: '#06B6D4' },
  { name: '图论', color: '#6366F1' },
  { name: '模拟', color: '#EC4899' },
]

const SEED_PROBLEMS: SeedProblem[] = [
  {
    logicId: 1001,
    title: '公交换乘最少步数',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 1,
    cases: 10,
    source: 'SEED',
    tagNames: ['模拟', '字符串'],
    content: `## 题意描述

你需要帮助小明从字符串形式的路线描述中提取每一段公交线路，并计算总共需要换乘多少次。

给定一行字符串，格式形如：\`A->B->C->D\`，每个站点名由大写字母组成，长度 1~10。

换乘次数定义为：经过的边数减 1。若只有一个站点，则换乘次数为 0。

## 输入格式

输入一行字符串 \`S\`，表示路线描述。

## 输出格式

输出一个整数，表示换乘次数。

## 样例输入

\`\`\`
A->B->C->D
\`\`\`

## 样例输出

\`\`\`
2
\`\`\`

## 数据范围

- \(1 \le |S| \le 10^5\)
- 站点数量不超过 \(10^4\)
- 保证输入合法（站点间用 \`->\` 连接）`,
  },
  {
    logicId: 1002,
    title: '台阶方案计数',
    timeLimit: 1000,
    memoryLimit: 256,
    difficulty: 2,
    cases: 15,
    source: 'SEED',
    tagNames: ['动态规划', '数学'],
    content: `## 题意描述

你在爬楼梯，每次可以上 1 级或 2 级台阶。给定台阶总数 \(n\)，求到达第 \(n\) 级的方法总数。

结果对 \(10^9+7\) 取模。

## 输入格式

输入一个整数 \(n\)。

## 输出格式

输出一个整数，表示方案数。

## 样例输入

\`\`\`
5
\`\`\`

## 样例输出

\`\`\`
8
\`\`\`

## 数据范围

- \(1 \le n \le 10^6\)
- 时间复杂度建议 \(O(n)\)，空间复杂度可优化到 \(O(1)\)` ,
  },
  {
    logicId: 1003,
    title: '区间最大差值',
    timeLimit: 1500,
    memoryLimit: 256,
    difficulty: 2,
    cases: 12,
    source: 'SEED',
    tagNames: ['排序', '贪心'],
    content: `## 题意描述

给定长度为 \(n\) 的整数数组，选择两个下标 \(i < j\)，使得 \(a_j - a_i\) 最大，输出最大值。

若不存在合法的 \(i,j\)（即 \(n<2\)），输出 0。

## 输入格式

- 第一行：整数 \(n\)
- 第二行：\(n\) 个整数 \(a_i\)

## 输出格式

输出一个整数，表示最大差值。

## 样例输入

\`\`\`
6
7 1 5 3 6 4
\`\`\`

## 样例输出

\`\`\`
5
\`\`\`

## 数据范围

- \(1 \le n \le 2 \times 10^5\)
- \(|a_i| \le 10^9\)
- 线性扫描维护前缀最小值可在 \(O(n)\) 内解决`,
  },
  {
    logicId: 1004,
    title: '回文子串统计',
    timeLimit: 1500,
    memoryLimit: 256,
    difficulty: 3,
    cases: 20,
    source: 'SEED',
    tagNames: ['字符串', '动态规划'],
    content: `## 题意描述

给定字符串 \(S\)，统计其中回文子串的数量（位置不同视为不同子串）。

## 输入格式

输入一行仅包含小写字母的字符串 \(S\)。

## 输出格式

输出一个整数，表示回文子串总数。

## 样例输入

\`\`\`
aaa
\`\`\`

## 样例输出

\`\`\`
6
\`\`\`

## 数据范围

- \(1 \le |S| \le 5000\)
- 可使用中心扩展 \(O(n^2)\) 或 DP \(O(n^2)\)` ,
  },
  {
    logicId: 1005,
    title: '网格最短路',
    timeLimit: 2000,
    memoryLimit: 512,
    difficulty: 3,
    cases: 18,
    source: 'SEED',
    tagNames: ['搜索', '图论'],
    content: `## 题意描述

在 \(n \times m\) 的网格中，\`S\` 表示起点，\`T\` 表示终点，\`#\` 为障碍，\`.\` 为可走格。

每次可向上下左右移动一格，求从 \`S\` 到 \`T\` 的最短步数；若不可达输出 -1。

## 输入格式

- 第一行：两个整数 \(n,m\)
- 接下来 \(n\) 行：每行一个长度为 \(m\) 的字符串

## 输出格式

输出一个整数，表示最短步数。

## 样例输入

\`\`\`
3 4
S...
.##.
...T
\`\`\`

## 样例输出

\`\`\`
5
\`\`\`

## 数据范围

- \(1 \le n,m \le 1000\)
- 保证恰有一个 \`S\` 和一个 \`T\`
- 推荐使用 BFS，复杂度 \(O(nm)\)` ,
  },
  {
    logicId: 1006,
    title: '有向图最短路径',
    timeLimit: 2500,
    memoryLimit: 512,
    difficulty: 4,
    cases: 20,
    source: 'SEED',
    tagNames: ['图论', '贪心'],
    content: `## 题意描述

给定一个带非负权有向图，求源点 \(s\) 到所有点的最短路长度。

若不可达，输出 \(-1\)。

## 输入格式

- 第一行：\(n,m,s\)
- 接下来 \(m\) 行：\(u,v,w\) 表示一条 \(u \to v\) 的边，权值为 \(w\)

## 输出格式

输出一行 \(n\) 个整数，第 \(i\) 个表示 \(s\) 到 \(i\) 的最短距离。

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
0 2 5 6
\`\`\`

## 数据范围

- \(1 \le n \le 2 \times 10^5\)
- \(1 \le m \le 4 \times 10^5\)
- \(0 \le w \le 10^9\)
- 建议使用堆优化 Dijkstra`,
  },
  {
    logicId: 1007,
    title: '最长递增子序列',
    timeLimit: 2000,
    memoryLimit: 256,
    difficulty: 4,
    cases: 20,
    source: 'SEED',
    tagNames: ['动态规划', '排序'],
    content: `## 题意描述

给定长度为 \(n\) 的序列，求其最长严格递增子序列（LIS）的长度。

## 输入格式

- 第一行：整数 \(n\)
- 第二行：\(n\) 个整数

## 输出格式

输出一个整数，表示 LIS 长度。

## 样例输入

\`\`\`
8
10 9 2 5 3 7 101 18
\`\`\`

## 样例输出

\`\`\`
4
\`\`\`

## 数据范围

- \(1 \le n \le 2 \times 10^5\)
- \(|a_i| \le 10^9\)
- 建议使用 \(O(n\log n)\) 做法`,
  },
  {
    logicId: 1008,
    title: '表达式求值器',
    timeLimit: 2000,
    memoryLimit: 256,
    difficulty: 5,
    cases: 25,
    source: 'SEED',
    tagNames: ['字符串', '模拟'],
    content: `## 题意描述

给定一个仅包含非负整数、\`+\`、\`-\`、\`*\`、\`/\`、括号和空格的中缀表达式，计算其结果。

整数除法向 0 取整。

## 输入格式

输入一行字符串 \(S\)，表示表达式。

## 输出格式

输出表达式计算结果（64 位整数范围内）。

## 样例输入

\`\`\`
(2+3)*4-10/3
\`\`\`

## 样例输出

\`\`\`
17
\`\`\`

## 数据范围

- \(1 \le |S| \le 2 \times 10^5\)
- 保证表达式合法
- 可用双栈或递归下降解析`,
  },
  {
    logicId: 1009,
    title: '最小生成树权值',
    timeLimit: 2500,
    memoryLimit: 512,
    difficulty: 5,
    cases: 20,
    source: 'SEED',
    tagNames: ['图论', '排序'],
    content: `## 题意描述

给定一个无向连通图，求其最小生成树（MST）的总权值。

## 输入格式

- 第一行：\(n,m\)
- 接下来 \(m\) 行：\(u,v,w\) 表示一条无向边

## 输出格式

输出一个整数，表示最小生成树总权值。

## 样例输入

\`\`\`
4 5
1 2 1
1 3 4
2 3 2
2 4 7
3 4 3
\`\`\`

## 样例输出

\`\`\`
6
\`\`\`

## 数据范围

- \(1 \le n \le 2 \times 10^5\)
- \(n-1 \le m \le 4 \times 10^5\)
- \(1 \le w \le 10^9\)
- 推荐 Kruskal + 并查集`,
  },
  {
    logicId: 1010,
    title: '多重背包优化',
    timeLimit: 3000,
    memoryLimit: 512,
    difficulty: 5,
    cases: 25,
    source: 'SEED',
    tagNames: ['动态规划', '数学'],
    content: `## 题意描述

有 \(n\) 种物品，第 \(i\) 种物品体积为 \(v_i\)，价值为 \(w_i\)，数量为 \(c_i\)。

给定背包容量 \(V\)，求可获得的最大总价值。

## 输入格式

- 第一行：\(n,V\)
- 接下来 \(n\) 行：\(v_i,w_i,c_i\)

## 输出格式

输出一个整数，表示最大价值。

## 样例输入

\`\`\`
3 10
2 3 3
3 4 2
5 7 1
\`\`\`

## 样例输出

\`\`\`
14
\`\`\`

## 数据范围

- \(1 \le n \le 1000\)
- \(1 \le V \le 2 \times 10^4\)
- \(1 \le v_i,w_i,c_i \le 10^4\)
- 推荐二进制拆分优化到 0/1 背包`,
  },
]

const CHINESE_NAMES = [
  '张三', '李四', '王五', '赵六', '孙七',
  '周八', '吴九', '郑十', '冯一', '陈二',
  '褚三', '卫四', '蒋五', '沈六', '韩七',
  '杨八', '朱九', '秦十', '尤一', '许二',
]

function chooseSex(index: number): string {
  const pool = ['male', 'female', 'unknown']
  return pool[(index * 7 + 3) % pool.length]
}

async function upsertTag(repo: import('typeorm').Repository<Tag>, name: string, color: string): Promise<Tag> {
  const existing = await repo.findOne({ where: { name } })
  if (existing) {
    existing.color = color
    return repo.save(existing)
  }
  return repo.save({ name, color } as Tag)
}

async function main() {
  console.log('🌱 开始注入增强版种子数据...')
  await AppDataSource.initialize()
  console.log('✅ 数据库连接成功\n')

  const userRepo = AppDataSource.getRepository(User)
  const problemRepo = AppDataSource.getRepository(Problem)
  const contestRepo = AppDataSource.getRepository(Contest)
  const courseRepo = AppDataSource.getRepository(Course)
  const tagRepo = AppDataSource.getRepository(Tag)
  const contestProblemRepo = AppDataSource.getRepository(ContestProblem)
  const courseProblemRepo = AppDataSource.getRepository(CourseProblem)
  const contestUserRepo = AppDataSource.getRepository(ContestUser)
  const courseUserRepo = AppDataSource.getRepository(CourseUser)
  const submissionRepo = AppDataSource.getRepository(Submission)
  const submissionMiscRepo = AppDataSource.getRepository(SubmissionMisc)
  const notificationRepo = AppDataSource.getRepository(Notification)

  const stats = {
    usersUpserted: 0,
    tagsUpserted: 0,
    problemsUpserted: 0,
    contestsUpserted: 0,
    coursesUpserted: 0,
    contestUsersUpserted: 0,
    courseUsersUpserted: 0,
    submissionsInserted: 0,
    notificationsUpserted: 0,
  }

  // 1) 用户
  console.log('👤 创建/更新测试用户 user1-user20 ...')
  const seedUsers: User[] = []
  for (let i = 1; i <= 20; i++) {
    const username = `user${i}`
    const certifiedName = CHINESE_NAMES[i - 1]
    let user = await userRepo.findOne({ where: { username } })

    if (!user) {
      user = userRepo.create({
        username,
        passwordHash: hashPassword('Test@123456'),
        authority: 'user',
        nickname: `测试用户${i}`,
        certifiedName,
        sex: chooseSex(i),
      })
    } else {
      user.passwordHash = hashPassword('Test@123456')
      user.authority = user.authority ?? 'user'
      user.nickname = user.nickname ?? `测试用户${i}`
      user.certifiedName = certifiedName
      user.sex = user.sex ?? chooseSex(i)
    }

    seedUsers.push(await userRepo.save(user))
    stats.usersUpserted += 1
  }

  console.log('🔑 处理测试管理员 testadmin ...')
  const testAdmin = await userRepo.findOne({ where: { username: 'testadmin' } })
  if (!testAdmin) {
    const existingSa = await userRepo.findOne({ where: { authority: In(['sa', 'superadmin']) } })
    if (existingSa) {
      console.log(`  - 已存在系统管理员 ${existingSa.username}（INIT_SA_PASSWORD 创建），跳过创建 testadmin`)
    } else {
      await userRepo.save(
        userRepo.create({
          username: 'testadmin',
          passwordHash: hashPassword('Admin@123456'),
          authority: 'admin',
          nickname: '测试管理员',
          certifiedName: '管理员',
          sex: 'unknown',
        }),
      )
      stats.usersUpserted += 1
    }
  }

  // 2) 标签
  console.log('\n🏷️  创建/更新标签...')
  const tagByName: Record<string, Tag> = {}
  for (const tag of SEED_TAGS) {
    tagByName[tag.name] = await upsertTag(tagRepo, tag.name, tag.color)
    stats.tagsUpserted += 1
  }

  // 3) 题目
  console.log('\n📝 创建/更新题目 SEED-1001~1010 ...')
  const problems: Problem[] = []
  for (const def of SEED_PROBLEMS) {
    const tags = def.tagNames.map((n) => tagByName[n]).filter(Boolean)
    let problem = await problemRepo.findOne({
      where: { prefix: 'SEED', logicId: def.logicId },
      relations: ['tags'],
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
        cases: def.cases,
        multiCases: false,
        status: ProblemStatus.ACCEPTED,
        closed: false,
        restricted: false,
        tags,
      })
    } else {
      problem.title = def.title
      problem.content = def.content
      problem.source = def.source
      problem.timeLimit = def.timeLimit
      problem.memoryLimit = def.memoryLimit
      problem.difficulty = def.difficulty
      problem.cases = def.cases
      problem.multiCases = false
      problem.status = ProblemStatus.ACCEPTED
      problem.closed = false
      problem.restricted = false
      problem.tags = tags
    }

    problems.push(await problemRepo.save(problem))
    stats.problemsUpserted += 1
  }

  const problemByLogicId = Object.fromEntries(problems.map((p) => [p.logicId, p])) as Record<number, Problem>

  // 4) 竞赛
  console.log('\n🏆 创建/更新竞赛...')
  const now = new Date()

  // Contest 1: 刚刚结束
  const contest1Name = 'SEED 测试竞赛'
  let contest1 = await contestRepo.findOne({ where: { name: contest1Name } })
  const contest1Start = new Date(now.getTime() - 60 * 60 * 1000)
  const contest1End = new Date(now.getTime())

  if (!contest1) {
    contest1 = contestRepo.create({
      name: contest1Name,
      description: 'SEED 种子竞赛（A-E）',
      type: 'contest',
      startTime: contest1Start,
      endTime: contest1End,
      public: true,
      openForRegistration: true,
      allowDirectLogin: false,
      penalty: 20,
      freezeTime: 0,
      freezeTimeAfterEnd: 0,
      fullyFreeze: false,
      scoreByPoint: false,
    })
  } else {
    contest1.description = 'SEED 种子竞赛（A-E）'
    contest1.startTime = contest1Start
    contest1.endTime = contest1End
    contest1.public = true
    contest1.openForRegistration = true
    contest1.penalty = 20
  }
  contest1 = await contestRepo.save(contest1)
  stats.contestsUpserted += 1

  const contest1ProblemIds = [1001, 1002, 1003, 1004, 1005].map((id) => problemByLogicId[id].id)
  const contest1Labels = ['A', 'B', 'C', 'D', 'E']
  for (let i = 0; i < contest1ProblemIds.length; i++) {
    await contestProblemRepo.save(
      contestProblemRepo.create({
        contestId: contest1.id,
        problemId: contest1ProblemIds[i],
        label: contest1Labels[i],
        weight: 100,
        color: '#22C55E',
      }),
    )
  }

  // Contest 2: 进行中
  const contest2Name = 'SEED 模拟赛2'
  let contest2 = await contestRepo.findOne({ where: { name: contest2Name } })
  const contest2Start = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const contest2End = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  if (!contest2) {
    contest2 = contestRepo.create({
      name: contest2Name,
      description: 'SEED 第二场模拟赛（A-C）',
      type: 'contest',
      startTime: contest2Start,
      endTime: contest2End,
      public: true,
      openForRegistration: true,
      allowDirectLogin: false,
      penalty: 20,
      freezeTime: 0,
      freezeTimeAfterEnd: 0,
      fullyFreeze: false,
      scoreByPoint: false,
    })
  } else {
    contest2.description = 'SEED 第二场模拟赛（A-C）'
    contest2.startTime = contest2Start
    contest2.endTime = contest2End
    contest2.public = true
    contest2.openForRegistration = true
    contest2.penalty = 20
  }
  contest2 = await contestRepo.save(contest2)
  stats.contestsUpserted += 1

  const contest2ProblemIds = [1006, 1007, 1008].map((id) => problemByLogicId[id].id)
  const contest2Labels = ['A', 'B', 'C']
  for (let i = 0; i < contest2ProblemIds.length; i++) {
    await contestProblemRepo.save(
      contestProblemRepo.create({
        contestId: contest2.id,
        problemId: contest2ProblemIds[i],
        label: contest2Labels[i],
        weight: 100,
        color: '#3B82F6',
      }),
    )
  }

  // 5) 竞赛参赛用户
  console.log('\n🧑‍💻 注册竞赛用户...')
  for (const user of seedUsers.slice(0, 10)) {
    await contestUserRepo.save(contestUserRepo.create({ contestId: contest1.id, userId: user.id }))
    stats.contestUsersUpserted += 1
  }
  for (const user of seedUsers.slice(0, 5)) {
    await contestUserRepo.save(contestUserRepo.create({ contestId: contest2.id, userId: user.id }))
    stats.contestUsersUpserted += 1
  }

  // 6) 竞赛1模拟提交（若已很多则跳过）
  console.log('\n📨 写入竞赛1模拟提交...')
  const contest1ExistsCountFixed = await submissionRepo.count({ where: { contestId: 1 } })
  const contest1ExistsCountReal = contest1.id === 1 ? contest1ExistsCountFixed : await submissionRepo.count({ where: { contestId: contest1.id } })

  if (contest1ExistsCountFixed > 10 || contest1ExistsCountReal > 10) {
    console.log(`  - 提交已存在（contestId=1: ${contest1ExistsCountFixed}, contestId=${contest1.id}: ${contest1ExistsCountReal}），跳过插入`)
  } else {
    const userByName = Object.fromEntries(seedUsers.map((u) => [u.username, u])) as Record<string, User>
    const contest1ProblemByLabel: Record<string, number> = {
      A: problemByLogicId[1001].id,
      B: problemByLogicId[1002].id,
      C: problemByLogicId[1003].id,
      D: problemByLogicId[1004].id,
      E: problemByLogicId[1005].id,
    }

    const plans: Array<{ user: string; label: keyof typeof contest1ProblemByLabel; status: 0 | 1; minute: number; time: number; memory: number }> = [
      { user: 'user1', label: 'A', status: 0, minute: 30, time: 120, memory: 16384 },
      { user: 'user1', label: 'B', status: 1, minute: 55, time: 300, memory: 20480 },
      { user: 'user1', label: 'B', status: 0, minute: 60, time: 180, memory: 20480 },
      { user: 'user1', label: 'C', status: 1, minute: 70, time: 500, memory: 32768 },

      { user: 'user2', label: 'A', status: 0, minute: 45, time: 130, memory: 16384 },
      { user: 'user2', label: 'B', status: 0, minute: 90, time: 210, memory: 24576 },
      { user: 'user2', label: 'D', status: 0, minute: 120, time: 190, memory: 20480 },

      { user: 'user3', label: 'A', status: 1, minute: 42, time: 420, memory: 16384 },
      { user: 'user3', label: 'A', status: 0, minute: 50, time: 160, memory: 16384 },
      { user: 'user3', label: 'B', status: 1, minute: 85, time: 410, memory: 24576 },

      { user: 'user4', label: 'A', status: 0, minute: 20, time: 100, memory: 12288 },

      { user: 'user5', label: 'A', status: 1, minute: 35, time: 400, memory: 16000 },
      { user: 'user5', label: 'A', status: 0, minute: 48, time: 180, memory: 16000 },
      { user: 'user5', label: 'C', status: 0, minute: 105, time: 260, memory: 30000 },

      { user: 'user6', label: 'B', status: 1, minute: 65, time: 360, memory: 22000 },
      { user: 'user6', label: 'B', status: 1, minute: 75, time: 350, memory: 22000 },
      { user: 'user6', label: 'D', status: 0, minute: 118, time: 240, memory: 26000 },

      { user: 'user7', label: 'A', status: 0, minute: 28, time: 125, memory: 15000 },
      { user: 'user7', label: 'E', status: 1, minute: 95, time: 520, memory: 32000 },

      { user: 'user8', label: 'C', status: 1, minute: 80, time: 480, memory: 28000 },
      { user: 'user8', label: 'C', status: 0, minute: 112, time: 220, memory: 28000 },

      { user: 'user9', label: 'A', status: 1, minute: 22, time: 390, memory: 15000 },
      { user: 'user9', label: 'B', status: 1, minute: 55, time: 420, memory: 23000 },
      { user: 'user9', label: 'E', status: 0, minute: 119, time: 300, memory: 35000 },

      { user: 'user10', label: 'D', status: 1, minute: 100, time: 530, memory: 26000 },
      { user: 'user10', label: 'D', status: 0, minute: 121, time: 210, memory: 26000 },
    ]

    for (const plan of plans) {
      const createdAt = new Date(contest1.startTime.getTime() + plan.minute * 60 * 1000)
      const submission = await submissionRepo.save(
        submissionRepo.create({
          userId: userByName[plan.user].id,
          problemId: contest1ProblemByLabel[plan.label],
          language: 1,
          status: plan.status,
          time: plan.time,
          memory: plan.memory,
          contestId: contest1.id,
          createdAt,
        }),
      )

      await submissionMiscRepo.save(
        submissionMiscRepo.create({
          submissionId: submission.id,
          code: `// ${plan.user} - ${plan.label}\nint main(){return 0;}`,
          judgeResult: JSON.stringify({ status: plan.status === 0 ? 'AC' : 'WA' }),
          compileErrorMsg: undefined,
        } as SubmissionMisc),
      )
      stats.submissionsInserted += 1
    }

    // 更新 contest_user 统计
    for (const user of seedUsers.slice(0, 10)) {
      const subs = await submissionRepo.find({ where: { contestId: contest1.id, userId: user.id } })
      const acSet = new Set(subs.filter((s) => s.status === 0).map((s) => s.problemId))
      await contestUserRepo.save(
        contestUserRepo.create({
          contestId: contest1.id,
          userId: user.id,
          submits: subs.length,
          accepts: acSet.size,
        }),
      )
    }
  }

  // 7) 课程（包含全部10题）
  console.log('\n📚 创建/更新课程...')
  const courseName = 'SEED 测试课程'
  let course = await courseRepo.findOne({ where: { name: courseName } })
  if (!course) {
    course = courseRepo.create({
      name: courseName,
      teacher: 'SEED Bot',
      notification: 'SEED 测试课程：覆盖全部 10 道题，供联调/演示使用。',
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endTime: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      type: 0,
      archived: false,
      scoreByPoint: false,
    })
  } else {
    course.teacher = 'SEED Bot'
    course.notification = 'SEED 测试课程：覆盖全部 10 道题，供联调/演示使用。'
    course.startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    course.endTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    course.archived = false
  }

  course = await courseRepo.save(course)
  stats.coursesUpserted += 1

  for (let i = 0; i < problems.length; i++) {
    await courseProblemRepo.save(
      courseProblemRepo.create({
        courseId: course.id,
        problemId: problems[i].id,
        weight: i + 1,
      }),
    )
  }

  // course_user 全量加入 user1-user20
  for (const user of seedUsers) {
    await courseUserRepo.save(courseUserRepo.create({ courseId: course.id, userId: user.id }))
    stats.courseUsersUpserted += 1
  }

  // 8) 通知（实体仅有 title/content，按标题幂等）
  console.log('\n📢 创建通知...')
  const notices = [
    {
      title: '欢迎来到 Leverage OJ 测试环境',
      content: '欢迎使用增强种子数据。你可以在题库、课程、竞赛和榜单中直接看到完整演示内容。',
    },
    {
      title: 'SEED 测试竞赛已结束，可查看 ICPC 榜单',
      content: 'SEED 测试竞赛已在刚刚结束，包含 A-E 五题与多用户提交记录，可用于榜单联调。',
    },
    {
      title: '提交与评测规则说明',
      content: '评测状态约定：0=AC，1=WA。种子提交含不同语言耗时与内存，便于测试筛选、统计与图表。',
    },
  ]

  for (const n of notices) {
    let entity = await notificationRepo.findOne({ where: { title: n.title } })
    if (!entity) {
      entity = notificationRepo.create({ title: n.title, content: n.content })
    } else {
      entity.content = n.content
    }
    await notificationRepo.save(entity)
    stats.notificationsUpserted += 1
  }

  await AppDataSource.destroy()

  console.log('\n🎉 种子数据注入完成！')
  console.log('📊 统计摘要：')
  console.log(`  - 用户 upsert: ${stats.usersUpserted}`)
  console.log(`  - 标签 upsert: ${stats.tagsUpserted}`)
  console.log(`  - 题目 upsert: ${stats.problemsUpserted}`)
  console.log(`  - 竞赛 upsert: ${stats.contestsUpserted}`)
  console.log(`  - 课程 upsert: ${stats.coursesUpserted}`)
  console.log(`  - 竞赛用户 upsert: ${stats.contestUsersUpserted}`)
  console.log(`  - 课程用户 upsert: ${stats.courseUsersUpserted}`)
  console.log(`  - 竞赛提交新增: ${stats.submissionsInserted}`)
  console.log(`  - 通知 upsert: ${stats.notificationsUpserted}`)
  console.log('\n🔐 测试账号：')
  console.log('  - user1~user20 / Test@123456')
  console.log('  - testadmin / Admin@123456（若系统已有 sa 则跳过）')
}

main().catch((err) => {
  console.error('❌ 种子数据注入失败：', err)
  process.exit(1)
})
