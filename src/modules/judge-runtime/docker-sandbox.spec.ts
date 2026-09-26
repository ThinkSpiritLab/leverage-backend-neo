import { DockerSandbox } from './docker-sandbox';
import { SandboxError } from './sandbox.types';

describe('DockerSandbox admission without starting Docker', () => {
  const sandbox = new DockerSandbox({ image: 'local:only' });
  it('rejects unsupported languages before container creation', async () => {
    await expect(
      sandbox.prepare({ language: 'shell' as never, source: 'true' }),
    ).rejects.toMatchObject({ status: 'SE' });
  });
  it('rejects oversized source before container creation', async () => {
    await expect(
      sandbox.prepare({
        language: 'python',
        source: 'x'.repeat(256 * 1024 + 1),
      }),
    ).rejects.toBeInstanceOf(SandboxError);
  });
  it('rejects an option-like image name', () => {
    expect(() => new DockerSandbox({ image: '--privileged' })).toThrow(
      SandboxError,
    );
  });
});
