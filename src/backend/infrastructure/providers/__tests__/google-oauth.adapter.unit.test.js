import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGoogleOAuthAdapter } from '../google-oauth.adapter.js';

const adapter = createGoogleOAuthAdapter();

beforeEach(() => vi.restoreAllMocks());

describe('google-oauth.adapter — buildAuthorizeUrl (puro)', () => {
  it('construye la URL con todos los params requeridos', () => {
    const url = adapter.buildAuthorizeUrl({
      clientId: 'XYZ.apps.googleusercontent.com',
      redirectUri: 'http://localhost:3000/auth/google/callback',
      state: 'stateJWT',
      scopes: ['openid', 'email', 'profile'],
    });
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=XYZ.apps.googleusercontent.com');
    // El redirect va URL-encoded.
    expect(url).toContain(`redirect_uri=${encodeURIComponent('http://localhost:3000/auth/google/callback')}`);
    expect(url).toContain('state=stateJWT');
    expect(url).toContain('response_type=code');
    // scopes: URLSearchParams codifica espacio como `+` (form-urlencoded).
    expect(url).toContain('scope=openid+email+profile');
    expect(url).toContain('access_type=online');
    expect(url).toContain('prompt=select_account');
  });
});

describe('google-oauth.adapter — exchangeCode', () => {
  it('POST al token endpoint y devuelve el token payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'AT', id_token: 'IT', expires_in: 3599 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await adapter.exchangeCode({
      clientId: 'XYZ.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-shhh',
      code: 'code-xyz',
      redirectUri: 'http://localhost:3000/auth/google/callback',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    // Body es form-urlencoded.
    const bodyStr = fetchMock.mock.calls[0][1].body;
    expect(bodyStr).toContain('code=code-xyz');
    expect(bodyStr).toContain('client_id=XYZ.apps.googleusercontent.com');
    expect(bodyStr).toContain('client_secret=GOCSPX-shhh');
    expect(bodyStr).toContain('grant_type=authorization_code');
    expect(result).toEqual({ accessToken: 'AT', idToken: 'IT' });
  });

  it('propaga error si Google devuelve non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Bad code' }),
    }));
    // El adapter prioriza `error_description` sobre `error`, así que el mensaje visible es 'Bad code'.
    await expect(adapter.exchangeCode({
      clientId: 'x', clientSecret: 'y', code: 'z', redirectUri: 'u',
    })).rejects.toThrow(/Bad code/);
  });
});

describe('google-oauth.adapter — fetchUserInfo', () => {
  it('GET al userinfo endpoint con Bearer y devuelve profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sub: '1234567890', email: 'ana@example.com', name: 'Ana' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const profile = await adapter.fetchUserInfo('AT');
    expect(fetchMock.mock.calls[0][0]).toBe('https://openidconnect.googleapis.com/v1/userinfo');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer AT');
    expect(profile).toEqual({ sub: '1234567890', email: 'ana@example.com', name: 'Ana' });
  });

  it('propaga error si el token es inválido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: 'invalid_token' }),
    }));
    await expect(adapter.fetchUserInfo('bad')).rejects.toThrow(/invalid_token/);
  });
});
