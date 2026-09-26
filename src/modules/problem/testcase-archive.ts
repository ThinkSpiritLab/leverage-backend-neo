import { BadRequestException } from '@nestjs/common';
import { crc32 } from 'node:zlib';
import type { Readable } from 'node:stream';
import * as yauzl from 'yauzl';
import { MAX_CASE_BYTES } from '../judge-runtime/test-data';

export const MAX_TESTCASE_ZIP_BYTES = 16 * 1024 * 1024;
const MAX_CASES = 64;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const INVALID_ZIP = 'Invalid test case ZIP archive';

function invalid(): never {
  throw new BadRequestException(INVALID_ZIP);
}

/** Accept only canonical, flat test case names; never extract to disk. */
export async function parseTestCaseZip(
  buffer: Buffer,
): Promise<{ files: Map<string, Buffer>; caseCount: number }> {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0 ||
    buffer.length > MAX_TESTCASE_ZIP_BYTES
  )
    invalid();

  let archive: yauzl.ZipFile | undefined;
  let activeStream: Readable | undefined;
  try {
    archive = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    if (archive.entryCount < 2 || archive.entryCount > MAX_CASES * 2) invalid();

    const files = new Map<string, Buffer>();
    let totalBytes = 0;
    for await (const entry of archive.eachEntry()) {
      const match = /^([1-9][0-9]*)\.(in|out)$/.exec(entry.fileName);
      const caseNumber = match ? Number(match[1]) : NaN;
      // Raw-byte equality also rejects malformed UTF-8, CP437-only names and
      // Info-ZIP Unicode Path extra fields that reinterpret another filename.
      if (
        !match ||
        !Number.isSafeInteger(caseNumber) ||
        caseNumber > MAX_CASES ||
        !Buffer.from(entry.fileName, 'utf8').equals(entry.fileNameRaw) ||
        files.has(entry.fileName) ||
        entry.isEncrypted() ||
        !entry.canDecodeFileData() ||
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize > MAX_CASE_BYTES ||
        !Number.isSafeInteger(entry.compressedSize) ||
        totalBytes + entry.uncompressedSize > MAX_TOTAL_BYTES
      )
        invalid();

      const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
      if (
        (entry.externalFileAttributes & 0x10) !== 0 ||
        (entry.versionMadeBy >>> 8 === 3 &&
          unixType !== 0 &&
          unixType !== 0x8000)
      )
        invalid();

      // Yauzl's default read stream consults central metadata; ensure the
      // local header cannot give another name or compression interpretation.
      const local = await archive.readLocalFileHeaderPromise(entry);
      if (
        !local.fileName.equals(entry.fileNameRaw) ||
        local.compressionMethod !== entry.compressionMethod ||
        local.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
        ((entry.generalPurposeBitFlag & 0x08) === 0 &&
          (local.uncompressedSize !== entry.uncompressedSize ||
            local.compressedSize !== entry.compressedSize ||
            local.crc32 !== entry.crc32))
      )
        invalid();

      activeStream = await archive.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let byteCount = 0;
      let checksum = 0;
      for await (const chunk of activeStream) {
        const bytes = chunk as Buffer;
        byteCount += bytes.length;
        if (
          byteCount > MAX_CASE_BYTES ||
          totalBytes + byteCount > MAX_TOTAL_BYTES
        )
          invalid();
        checksum = crc32(bytes, checksum);
        chunks.push(bytes);
      }
      activeStream = undefined;
      if (byteCount !== entry.uncompressedSize || checksum !== entry.crc32)
        invalid();
      const contents = Buffer.concat(chunks, byteCount);
      // The judge reads testcase files with a fatal UTF-8 decoder.
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(contents);
      } catch {
        invalid();
      }
      totalBytes += byteCount;
      files.set(entry.fileName, contents);
    }

    const caseCount = files.size / 2;
    if (!Number.isInteger(caseCount) || caseCount < 1 || caseCount > MAX_CASES)
      invalid();
    for (let number = 1; number <= caseCount; number++) {
      if (!files.has(`${number}.in`) || !files.has(`${number}.out`)) invalid();
    }
    return { files, caseCount };
  } catch {
    // Yauzl/zlib errors may include raw filenames or host paths; do not relay.
    throw new BadRequestException(INVALID_ZIP);
  } finally {
    activeStream?.destroy();
    archive?.close();
  }
}
