import 'reflect-metadata'
import { DataSource, In, Like } from 'typeorm'
import { config } from 'dotenv'
import * as path from 'path'

config({ path: path.resolve(__dirname, '../.env') })

import { User } from '../src/database/entities/user.entity'
import { Problem } from '../src/database/entities/problem.entity'
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

async function main() {
  console.log('🧹 开始清理种子数据...')
  await AppDataSource.initialize()
  console.log('✅ 数据库连接成功')

  const userRepo = AppDataSource.getRepository(User)
  const problemRepo = AppDataSource.getRepository(Problem)
  const contestRepo = AppDataSource.getRepository(Contest)
  const courseRepo = AppDataSource.getRepository(Course)
  const contestProblemRepo = AppDataSource.getRepository(ContestProblem)
  const courseProblemRepo = AppDataSource.getRepository(CourseProblem)

  // ── 1. 清理竞赛题目关联（先删关联，再删竞赛）────────────────────────────────
  console.log('\n🏆 清理竞赛...')
  const seedContests = await contestRepo.find({ where: { name: Like('SEED%') } })
  if (seedContests.length > 0) {
    const contestIds = seedContests.map((c) => c.id)
    const cpDeleted = await contestProblemRepo.delete({ contestId: In(contestIds) })
    console.log(`  ✓ 删除竞赛题目关联 ${cpDeleted.affected ?? 0} 条`)
    const cDeleted = await contestRepo.delete({ name: Like('SEED%') })
    console.log(`  ✓ 删除竞赛 ${cDeleted.affected ?? 0} 条`)
  } else {
    console.log('  - 无 SEED 竞赛，跳过')
  }

  // ── 2. 清理课程题目关联（先删关联，再删课程）────────────────────────────────
  console.log('\n📚 清理课程...')
  const seedCourses = await courseRepo.find({ where: { name: Like('SEED%') } })
  if (seedCourses.length > 0) {
    const courseIds = seedCourses.map((c) => c.id)
    const cpDeleted = await courseProblemRepo.delete({ courseId: In(courseIds) })
    console.log(`  ✓ 删除课程题目关联 ${cpDeleted.affected ?? 0} 条`)
    const cDeleted = await courseRepo.delete({ name: Like('SEED%') })
    console.log(`  ✓ 删除课程 ${cDeleted.affected ?? 0} 条`)
  } else {
    console.log('  - 无 SEED 课程，跳过')
  }

  // ── 3. 清理题目 ────────────────────────────────────────────────────────────
  console.log('\n📝 清理题目...')
  const pDeleted = await problemRepo.delete({ prefix: 'SEED' })
  console.log(`  ✓ 删除题目 ${pDeleted.affected ?? 0} 条`)

  // ── 4. 清理测试用户（保留 sa 账号）───────────────────────────────────────────
  console.log('\n👤 清理测试用户...')
  const seedUsernames = [
    'user1', 'user2', 'user3', 'user4', 'user5',
    'user6', 'user7', 'user8', 'user9', 'user10',
    'testadmin',
  ]
  const uDeleted = await userRepo.delete({ username: In(seedUsernames) })
  console.log(`  ✓ 删除用户 ${uDeleted.affected ?? 0} 个`)

  await AppDataSource.destroy()
  console.log('\n✅ 种子数据清理完成！（sa 账号已保留）')
}

main().catch((err) => {
  console.error('❌ 清理失败：', err)
  process.exit(1)
})
