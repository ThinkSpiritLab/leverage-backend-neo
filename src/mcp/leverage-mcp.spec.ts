import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

function fixture() {
  const tools: Record<string, { schema: z.ZodRawShape; run: (args: any) => Promise<unknown> }> = {};
  const calls: Array<{ url: string; body?: any }> = [];
  let polls = 0;
  const source = fs.readFileSync(path.join(__dirname, 'leverage-mcp.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, {
    exports: {},
    require: (name: string) => {
      if (name.includes('/server/mcp')) return { McpServer: class { tool(name: string, _description: string, schema: z.ZodRawShape, run: (args: any) => Promise<unknown>) { tools[name] = { schema, run }; } connect() { return Promise.resolve(); } } };
      if (name.includes('/server/stdio')) return { StdioServerTransport: class {} };
      return require(name);
    },
    process: { env: { LEVERAGE_TOKEN: 'fixture-token' }, stderr: { write() {} }, exit() {} },
    setTimeout: (fn: () => void) => fn(),
    fetch: async (url: string, init: { body?: string }) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
      const body = url.endsWith('/matches/33') ? { id: 33, status: ++polls === 1 ? 1 : 2, result: { rounds: [] } } : { matchId: 33, id: 1 };
      return { ok: true, json: async () => body };
    },
  });
  return { calls, call: (name: string, args: unknown) => tools[name].run(z.object(tools[name].schema).parse(args)) };
}

describe('MCP authoring contract', () => {
  it.each([9, 'python'])('sends a string runtime for submit_judge input %s', async (judgerLanguage) => {
    const f = fixture();
    await f.call('submit_judge', { gameId: 1, judgerCode: 'print(1)', judgerLanguage });
    expect(f.calls[0].body).toEqual({ judgerCode: 'print(1)', judgerLanguage: 'python' });
  });
  it('keeps polling numeric RUNNING before returning FINISHED', async () => {
    const f = fixture();
    await f.call('test_judge', { gameId: 1, bot0GamerId: 1, bot1GamerId: 2 });
    expect(f.calls.filter(call => call.url.endsWith('/matches/33'))).toHaveLength(2);
  });
});
