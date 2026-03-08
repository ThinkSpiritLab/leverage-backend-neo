import {
  hashPassword,
  isLegacyPasswordFormat,
  verifyPassword,
} from './crypto.util';

describe('crypto.util', () => {
  describe('hashPassword', () => {
    it('应生成 pbkdf2: 前缀的 hash', () => {
      const hash = hashPassword('myPassword');
      expect(hash).toMatch(/^pbkdf2:/);
    });

    it('同一密码两次 hash 结果不同（salt 随机）', () => {
      const hash1 = hashPassword('myPassword');
      const hash2 = hashPassword('myPassword');
      expect(hash1).not.toBe(hash2);
    });

    it('hash 格式应为 pbkdf2:<salt>:<hash>', () => {
      const hash = hashPassword('test');
      const parts = hash.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('pbkdf2');
      expect(parts[1]).toHaveLength(32); // 16 bytes = 32 hex chars
      expect(parts[2]).toHaveLength(128); // 64 bytes = 128 hex chars
    });
  });

  describe('verifyPassword', () => {
    it('正确密码应验证通过', () => {
      const password = 'correctPassword';
      const hash = hashPassword(password);
      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('错误密码应验证失败', () => {
      const hash = hashPassword('correctPassword');
      expect(verifyPassword('wrongPassword', hash)).toBe(false);
    });

    it('空密码应验证失败', () => {
      const hash = hashPassword('correctPassword');
      expect(verifyPassword('', hash)).toBe(false);
    });
  });

  describe('isLegacyPasswordFormat', () => {
    it('pbkdf2: 开头的应返回 false（新格式）', () => {
      const hash = hashPassword('test');
      expect(isLegacyPasswordFormat(hash)).toBe(false);
    });

    it('不含 pbkdf2: 前缀的应返回 true（旧格式）', () => {
      expect(isLegacyPasswordFormat('abc123def456')).toBe(true);
    });
  });
});
