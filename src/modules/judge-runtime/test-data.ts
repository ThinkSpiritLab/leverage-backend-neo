import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Problem } from '../../database/entities/problem.entity';
import type { JudgeCase } from './judge.contracts';

/** Engineering admission bound, aligned with the first sandbox stdin/output limit. */
export const MAX_CASE_BYTES = 1024 * 1024;
const inside = (parent: string, child: string) => child.startsWith(parent + path.sep);

async function readCaseFile(directory: string, name: string): Promise<string> {
  try {
    const target = await fs.realpath(path.join(directory, name));
    if (!inside(directory, target)) throw new Error('outside test directory');
    const file = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_CASE_BYTES) throw new Error('invalid case size/type');
      const data = await file.readFile();
      if (data.length > MAX_CASE_BYTES) throw new Error('case grew during read');
      return new TextDecoder('utf-8', { fatal: true }).decode(data);
    } finally { await file.close(); }
  } catch {
    // Do not return host paths or read a partial/missing test as an empty case.
    throw new Error(`Test data ${name} is missing, invalid or exceeds ${MAX_CASE_BYTES} bytes`);
  }
}

export async function* problemCases(root: string, problem: Pick<Problem, 'prefix' | 'logicId' | 'cases'>): AsyncGenerator<JudgeCase> {
  if (!Number.isSafeInteger(problem.cases) || problem.cases < 1) throw new Error('Problem has no test cases');
  let directory: string;
  try {
    const base = await fs.realpath(root);
    directory = await fs.realpath(path.resolve(base, problem.prefix, String(problem.logicId)));
    if (!inside(base, directory)) throw new Error('outside test root');
  } catch { throw new Error('Problem test directory is unavailable'); }
  for (let id = 1; id <= problem.cases; id++) {
    const input = await readCaseFile(directory, `${id}.in`);
    const expectedOutput = await readCaseFile(directory, `${id}.out`);
    yield { id, input, expectedOutput };
  }
}
