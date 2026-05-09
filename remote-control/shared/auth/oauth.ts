/**
 * OAuth 认证管理
 */

import { OAuthToken } from './jwt';

// ============ 配置 ============

const OAUTH_CONFIG = {
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://claude.ai/oauth/token',
  redirectUri: 'claude-code://oauth/callback',
  scope: 'openid profile email offline_access',
  clientId: 'claude-code-cli'
};

// ============ OAuth 状态 ============

interface OAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

let oauthState: OAuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null
};

// ============ OAuth 流程 ============

export function getOAuthAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    response_type: 'code',
    scope: OAUTH_CONFIG.scope,
    state: generateRandomState()
  });

  return `${OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<OAuthToken> {
  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      client_id: OAUTH_CONFIG.clientId
    }).toString()
  });

  if (!response.ok) {
    throw new Error(`OAuth token exchange failed: ${response.statusText}`);
  }

  const token = await response.json() as OAuthToken;

  // 更新状态
  oauthState.accessToken = token.access_token;
  oauthState.refreshToken = token.refresh_token || null;
  oauthState.expiresAt = token.expires_in
    ? Date.now() + token.expires_in * 1000
    : null;

  return token;
}

export async function refreshAccessToken(): Promise<string> {
  if (!oauthState.refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: oauthState.refreshToken,
      client_id: OAUTH_CONFIG.clientId
    }).toString()
  });

  if (!response.ok) {
    oauthState.accessToken = null;
    oauthState.refreshToken = null;
    oauthState.expiresAt = null;
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  const token = await response.json() as OAuthToken;

  oauthState.accessToken = token.access_token;
  if (token.refresh_token) {
    oauthState.refreshToken = token.refresh_token;
  }
  oauthState.expiresAt = token.expires_in
    ? Date.now() + token.expires_in * 1000
    : null;

  return token.access_token;
}

// ============ 状态管理 ============

export function getAccessToken(): string | null {
  return oauthState.accessToken;
}

export function isAuthenticated(): boolean {
  return oauthState.accessToken !== null && !isTokenExpired();
}

export function isTokenExpired(): boolean {
  if (!oauthState.expiresAt) return false;
  // 提前 5 分钟判断过期
  return Date.now() > oauthState.expiresAt - 5 * 60 * 1000;
}

export async function getValidAccessToken(): Promise<string> {
  if (!oauthState.accessToken) {
    throw new Error('Not authenticated');
  }

  if (isTokenExpired()) {
    return refreshAccessToken();
  }

  return oauthState.accessToken;
}

export function clearAuth(): void {
  oauthState = {
    accessToken: null,
    refreshToken: null,
    expiresAt: null
  };
}

// ============ 辅助函数 ============

function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}
