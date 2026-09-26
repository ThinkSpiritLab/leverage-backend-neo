import { BadRequestException } from '@nestjs/common';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { MAX_TESTCASE_ZIP_BYTES, parseTestCaseZip } from './testcase-archive';

type File = [string, Buffer | string];

async function zip(files: File[]): Promise<Buffer> {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    output.on('error', reject);
    output.on('end', () => resolve(Buffer.concat(chunks)));
  });
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (error) => output.destroy(error));
  archive.pipe(output);
  for (const [name, data] of files) archive.append(data, { name });
  await archive.finalize();
  return done;
}

// Mutate only the first central-directory header; payload and descriptor stay intact.
function centralField(
  input: Buffer,
  offset: number,
  value: number,
  width: 2 | 4 = 2,
): Buffer {
  const result = Buffer.from(input);
  const header = result.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (header < 0) throw new Error('fixture lacks central header');
  if (width === 2) result.writeUInt16LE(value, header + offset);
  else result.writeUInt32LE(value, header + offset);
  return result;
}

async function rejects(zipBytes: Buffer): Promise<void> {
  await expect(parseTestCaseZip(zipBytes)).rejects.toBeInstanceOf(
    BadRequestException,
  );
}

describe('parseTestCaseZip', () => {
  it('accepts one pair and preserves raw file bytes', async () => {
    const input = Buffer.from([0, 0xc3, 0xa9, 10]);
    const result = await parseTestCaseZip(
      await zip([
        ['1.out', 'yes\n'],
        ['1.in', input],
      ]),
    );
    expect(result.caseCount).toBe(1);
    expect([...result.files.keys()]).toEqual(['1.out', '1.in']);
    expect(result.files.get('1.in')).toEqual(input);
  });

  it('accepts consecutive pairs up to 64 in any archive order', async () => {
    const files: File[] = [];
    for (let n = 64; n >= 1; n--)
      files.push([`${n}.out`, 'ok'], [`${n}.in`, String(n)]);
    const result = await parseTestCaseZip(await zip(files));
    expect(result.caseCount).toBe(64);
    expect(result.files.size).toBe(128);
    expect(result.files.get('64.in')?.toString()).toBe('64');
  });

  it.each(['../1.in', 'nested/1.in', '/1.in', '1\\in', 'other.txt', '1.in/'])(
    'rejects invalid archive entry %s',
    async (name) =>
      rejects(
        await zip([
          [name, 'x'],
          ['1.in', 'x'],
          ['1.out', 'x'],
        ]),
      ),
  );

  it.each([
    {
      files: [
        ['1.in', 'x'],
        ['1.in', 'again'],
        ['1.out', 'x'],
      ],
    },
    { files: [['1.in', 'x']] },
    {
      files: [
        ['2.in', 'x'],
        ['2.out', 'x'],
      ],
    },
    {
      files: [
        ['1.in', 'x'],
        ['1.out', 'x'],
        ['3.in', 'x'],
        ['3.out', 'x'],
      ],
    },
    {
      files: [
        ['0.in', 'x'],
        ['0.out', 'x'],
      ],
    },
    {
      files: [
        ['01.in', 'x'],
        ['01.out', 'x'],
      ],
    },
  ] as { files: File[] }[])(
    'rejects duplicate, incomplete or nonconsecutive pairs (%j)',
    async ({ files }) => {
      await rejects(await zip(files));
    },
  );

  it('rejects an archive with more than 64 pairs', async () => {
    const files: File[] = [];
    for (let n = 1; n <= 65; n++)
      files.push([`${n}.in`, 'x'], [`${n}.out`, 'y']);
    await rejects(await zip(files));
  });

  it('rejects over-limit compressed and per-entry decompressed bytes', async () => {
    expect(MAX_TESTCASE_ZIP_BYTES).toBe(16 * 1024 * 1024);
    await rejects(Buffer.alloc(MAX_TESTCASE_ZIP_BYTES + 1));
    await rejects(
      await zip([
        ['1.in', Buffer.alloc(1024 * 1024 + 1)],
        ['1.out', 'x'],
      ]),
    );
  });

  it('rejects a declared-small decompression bomb while streaming', async () => {
    const valid = await zip([
      ['1.in', Buffer.alloc(1024 * 1024 + 8192)],
      ['1.out', 'x'],
    ]);
    await rejects(centralField(valid, 24, 1, 4));
  });

  it('rejects aggregate decompressed bytes over 64 MiB', async () => {
    const files: File[] = [];
    for (let n = 1; n <= 64; n++) {
      files.push([`${n}.in`, Buffer.alloc(1024 * 1024)], [`${n}.out`, 'x']);
    }
    await rejects(await zip(files));
  });

  it('rejects empty, non-zip, empty zip and corrupted entry sizes', async () => {
    await rejects(Buffer.alloc(0));
    await rejects(Buffer.from('not a zip'));
    await rejects(await zip([]));
    const valid = await zip([
      ['1.in', 'hello'],
      ['1.out', 'world'],
    ]);
    await rejects(centralField(valid, 24, 4, 4)); // declared uncompressed size 4 instead of 5
  });

  it('rejects invalid UTF-8 testcase contents', async () => {
    await rejects(
      await zip([
        ['1.in', Buffer.from([0xff])],
        ['1.out', '5\n'],
      ]),
    );
    await rejects(
      await zip([
        ['1.in', '2 3\n'],
        ['1.out', Buffer.from([0xc3, 0x28])],
      ]),
    );
  });

  it('rejects invalid UTF-8 filename bytes, even without the UTF-8 flag', async () => {
    const valid = await zip([
      ['1.in', 'x'],
      ['1.out', 'y'],
    ]);
    const mutated = Buffer.from(valid);
    const header = mutated.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    mutated[header + 46] = 0xff;
    await rejects(mutated);
  });

  it('rejects a Unix symlink, encryption, unsupported compression and CRC corruption', async () => {
    const valid = await zip([
      ['1.in', 'x'],
      ['1.out', 'y'],
    ]);
    // Unix creator (upper versionMadeBy byte), POSIX symlink type in mode bits.
    await rejects(
      centralField(centralField(valid, 5, 3, 2), 38, 0xa1ff0000, 4),
    );
    await rejects(centralField(valid, 8, 1));
    await rejects(centralField(valid, 10, 99));
    await rejects(centralField(valid, 16, 0, 4));
  });
});
