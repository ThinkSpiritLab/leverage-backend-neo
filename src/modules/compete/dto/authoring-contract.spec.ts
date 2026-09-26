import { ValidationPipe } from '@nestjs/common';
import { CreateGameDto } from './create-game.dto';
import { PlaygroundJudgeDto } from './playground-judge.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const game = { title: 'Example', description: '', gamerQuantity: 2, timeLimit: 1000, memoryLimit: 256, judgerCode: 'print(1)' };

describe('Botzone authoring payloads', () => {
  it.each(['python', 'cpp', 'cpp17', 'c', 'java', 'javascript', 'go'])('accepts runtime language %s for creation and tests', async (language) => {
    await expect(pipe.transform({ ...game, judgerLanguage: language }, { type: 'body', metatype: CreateGameDto })).resolves.toMatchObject({ judgerLanguage: language });
    await expect(pipe.transform({ judgerLanguage: language, bot0: { code: 'example', language }, bot1: { gamerId: 1 } }, { type: 'body', metatype: PlaygroundJudgeDto })).resolves.toMatchObject({ judgerLanguage: language });
  });
  it('does not reinterpret numeric OJ language IDs as runtime names', async () => {
    await expect(pipe.transform({ ...game, judgerLanguage: 9 }, { type: 'body', metatype: CreateGameDto })).rejects.toThrow();
    await expect(pipe.transform({ judgerLanguage: 9, bot0: { gamerId: 1 }, bot1: { gamerId: 2 } }, { type: 'body', metatype: PlaygroundJudgeDto })).rejects.toThrow();
  });
});
