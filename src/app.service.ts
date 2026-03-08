import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getStat() {
    const [problem, user, submission, notification, message, course, contest] =
      await Promise.all([
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM problem'),
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM user'),
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM submission'),
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM notification'),
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM message'),
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM course'),
        this.dataSource.query('SELECT COUNT(*) AS cnt FROM contest'),
      ]);
    return {
      problem: Number(problem[0]?.cnt ?? 0),
      user: Number(user[0]?.cnt ?? 0),
      submission: Number(submission[0]?.cnt ?? 0),
      notification: Number(notification[0]?.cnt ?? 0),
      message: Number(message[0]?.cnt ?? 0),
      course: Number(course[0]?.cnt ?? 0),
      contest: Number(contest[0]?.cnt ?? 0),
    };
  }
}
