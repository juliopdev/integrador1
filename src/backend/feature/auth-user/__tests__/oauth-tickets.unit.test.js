import { describe, it, expect } from 'vitest';
import { signOAuthState, verifyOAuthState, signOAuthTicket, verifyOAuthTicket } from '../infrastructure/oauth-tickets.js';

describe('oauth-tickets — state (initiate → callback)', () => {
  it('firma y verifica un state válido', () => {
    const state = signOAuthState({ tenantId: 't1', returnTo: '/', nonce: 'abc' });
    const decoded = verifyOAuthState(state);
    expect(decoded).toMatchObject({ tenantId: 't1', returnTo: '/', nonce: 'abc', typ: 'oauth_state' });
  });

  it('un ticket firmado como state NO es verificable como ticket (typ mismatch)', () => {
    const state = signOAuthState({ tenantId: 't1', returnTo: '/', nonce: 'abc' });
    expect(() => verifyOAuthTicket(state)).toThrow();
  });

  it('rechaza un token con firma inválida', () => {
    expect(() => verifyOAuthState('not.a.jwt')).toThrow();
  });
});

describe('oauth-tickets — ticket (callback → exchange)', () => {
  it('firma y verifica un ticket válido', () => {
    const ticket = signOAuthTicket({ userId: 'u1', email: 'a@b.com', tenantId: 't1', returnTo: '/' });
    const decoded = verifyOAuthTicket(ticket);
    expect(decoded).toMatchObject({ userId: 'u1', email: 'a@b.com', tenantId: 't1', returnTo: '/', typ: 'oauth_ticket' });
  });

  it('un state firmado como ticket NO es verificable como state (typ mismatch)', () => {
    const ticket = signOAuthTicket({ userId: 'u1', email: 'a@b.com', tenantId: 't1', returnTo: '/' });
    expect(() => verifyOAuthState(ticket)).toThrow();
  });
});
