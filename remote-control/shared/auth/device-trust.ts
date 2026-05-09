/**
 * 设备信任管理
 */

// ============ 设备信任 Token ============

export interface DeviceTrustToken {
  device_id: string;
  created_at: number;
  expires_at: number;
  trusted_scopes: string[];
}

// ============ 安全存储接口 ============

interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// 默认使用内存存储（实际应使用 Keychain/Keyring）
class MemoryStorage implements SecureStorage {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let secureStorage: SecureStorage = new MemoryStorage();

// ============ 设备信任管理 ============

const DEVICE_TRUST_KEY = 'claude-trusted-device';
const TRUST_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 天

export async function getDeviceId(): Promise<string> {
  // 生成或获取设备 ID
  let deviceId = await secureStorage.get('device-id');
  if (!deviceId) {
    deviceId = generateDeviceId();
    await secureStorage.set('device-id', deviceId);
  }
  return deviceId;
}

export async function getTrustedDeviceToken(): Promise<string | null> {
  const tokenStr = await secureStorage.get(DEVICE_TRUST_KEY);
  if (!tokenStr) return null;

  try {
    const token = JSON.parse(tokenStr) as DeviceTrustToken;

    // 检查是否过期
    if (Date.now() > token.expires_at) {
      await secureStorage.delete(DEVICE_TRUST_KEY);
      return null;
    }

    return tokenStr;
  } catch {
    await secureStorage.delete(DEVICE_TRUST_KEY);
    return null;
  }
}

export async function setTrustedDeviceToken(
  scopes: string[] = ['permission_skip', 'auto_reconnect']
): Promise<string> {
  const deviceId = await getDeviceId();
  const now = Date.now();

  const token: DeviceTrustToken = {
    device_id: deviceId,
    created_at: now,
    expires_at: now + TRUST_DURATION,
    trusted_scopes: scopes
  };

  const tokenStr = JSON.stringify(token);
  await secureStorage.set(DEVICE_TRUST_KEY, tokenStr);

  return tokenStr;
}

export async function clearTrustedDevice(): Promise<void> {
  await secureStorage.delete(DEVICE_TRUST_KEY);
}

export async function isDeviceTrusted(): Promise<boolean> {
  const token = await getTrustedDeviceToken();
  return token !== null;
}

export async function hasTrustedScope(scope: string): Promise<boolean> {
  const tokenStr = await getTrustedDeviceToken();
  if (!tokenStr) return false;

  try {
    const token = JSON.parse(tokenStr) as DeviceTrustToken;
    return token.trusted_scopes.includes(scope);
  } catch {
    return false;
  }
}

// ============ 配置 ============

export function setSecureStorage(storage: SecureStorage): void {
  secureStorage = storage;
}

// ============ 辅助函数 ============

function generateDeviceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `${timestamp}-${random}`;
}
