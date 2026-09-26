import archiver from 'archiver';

/** Generate a ZIP in memory; no binary fixture enters the repository. */
export async function zipCases(
  files: Record<string, string | Buffer>,
): Promise<Buffer> {
  const archive = archiver('zip');
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
  });
  for (const [name, contents] of Object.entries(files))
    archive.append(contents, { name });
  await archive.finalize();
  return done;
}
