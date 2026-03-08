import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'crypto';

const ITERATIONS = 100000;
const KEY_LENGTH = 64;
const DIGEST = 'sha256';

/**
 * 使用 PBKDF2-SHA256 + 随机 salt 哈希密码。
 * 格式：`pbkdf2:<16字节salt的hex>:<64字节hash的hex>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(
    password,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    DIGEST,
  ).toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

/**
 * 验证密码。支持新格式（PBKDF2）和旧格式（HMAC-SHA256(MD5(password))）。
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('pbkdf2:')) {
    const [, salt, hash] = stored.split(':');
    const computed = pbkdf2Sync(
      password,
      salt,
      ITERATIONS,
      KEY_LENGTH,
      DIGEST,
    ).toString('hex');
    return computed === hash;
  }
  // 兼容旧格式：HMAC-SHA256(MD5(password))
  return legacyVerify(password, stored);
}

/**
 * 旧版密码验证：HMAC-SHA256(MD5(password))，key 从环境变量读取。
 */
function legacyVerify(password: string, stored: string): boolean {
  const hmacKey = process.env.PASSWORD_HMAC_KEY;
  if (!hmacKey) return false;
  const legacy = createHmac('sha256', hmacKey)
    .update(createHash('md5').update(password).digest('hex'))
    .digest('hex');
  return legacy === stored;
}

/**
 * 判断密码是否为旧格式（不含 pbkdf2: 前缀）
 */
export function isLegacyPasswordFormat(stored: string): boolean {
  return !stored.startsWith('pbkdf2:');
}
