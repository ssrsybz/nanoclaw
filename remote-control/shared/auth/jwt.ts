/**
 * JWT 工具
 */

import * as crypto from 'crypto';

// ============ JWT 结构定义 ============

export interface WorkerJWT {
  session_id: string;
  role: 'worker';
  exp: number;
  iat: number;
  org_uuid?: string;
  environment_id?: string;
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

// ============ JWT 签名 ============

// 签名密钥 (生产环境应从环境变量获取)
const JWT_SECRET = process.env.JWT_SECRET || 'claude-remote-control-secret-key';

/**
 * 简单的 JWT 签名 (仅用于开发/演示)
 * 生产环境应使用专业的 JWT 库如 jsonwebtoken
 */
export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * 验证 JWT 签名
 */
export function verifyJwt(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };

    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

// ============ JWT 工具函数 ============

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

export function decodeWorkerJwt(token: string): WorkerJWT | null {
  const decoded = decodeJwt(token);
  if (!decoded) return null;

  if (
    typeof decoded.session_id === 'string' &&
    decoded.role === 'worker'
  ) {
    return decoded as unknown as WorkerJWT;
  }

  return null;
}

export function isJwtExpired(token: string): boolean {
  const decoded = decodeJwt(token);
  if (!decoded || typeof decoded.exp !== 'number') return true;

  // 提前 5 分钟判断过期
  const now = Math.floor(Date.now() / 1000);
  return decoded.exp < now + 300;
}

export function getJwtExpiry(token: string): Date | null {
  const decoded = decodeJwt(token);
  if (!decoded || typeof decoded.exp !== 'number') return null;

  return new Date(decoded.exp * 1000);
}

// ============ JWT 验证 ============

export function validateWorkerJwt(
  token: string,
  expectedSessionId?: string
): { valid: boolean; error?: string; payload?: WorkerJWT } {
  const payload = decodeWorkerJwt(token);

  if (!payload) {
    return { valid: false, error: 'Invalid JWT format' };
  }

  if (payload.role !== 'worker') {
    return { valid: false, error: 'Invalid role' };
  }

  if (isJwtExpired(token)) {
    return { valid: false, error: 'Token expired' };
  }

  if (expectedSessionId && payload.session_id !== expectedSessionId) {
    return { valid: false, error: 'Session ID mismatch' };
  }

  return { valid: true, payload };
}

// ============ HTTP Headers ============

export function getAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json'
  };
}
