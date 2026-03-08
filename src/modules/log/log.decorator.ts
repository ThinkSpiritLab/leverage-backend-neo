import { SetMetadata } from '@nestjs/common';

export interface LogSettings {
  field: string;
  action: string;
  /** 是否记录请求 body 到 payload */
  requirePayload?: boolean;
}

export const REQUIRE_LOG_KEY = 'log-settings';

/**
 * 标记该接口需要记录操作日志
 * @param field  模块名，如 'problem' / 'contest' / 'user'
 * @param action 操作名，如 'create' / 'update' / 'delete'
 * @param requirePayload 是否把请求 body 写入 payload（默认 false）
 */
export const RequireLog = (field: string, action: string, requirePayload = false) =>
  SetMetadata(REQUIRE_LOG_KEY, { field, action, requirePayload } as LogSettings);
