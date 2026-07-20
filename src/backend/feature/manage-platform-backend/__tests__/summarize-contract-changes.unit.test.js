import { describe, it, expect } from 'vitest';
import { summarizeContractChanges } from '../domain/summarize-contract-changes.js';

const empty = () => ({ resources: [], endpoints: [], auth: {}, websocket: { channels: [] } });

describe('summarize-contract-changes (Iter 32 F) — diff draft vs publicado', () => {
  it('sin draft → null (no hay nada por publicar)', () => {
    expect(summarizeContractChanges({ draftSchema: null, publishedSchema: empty() })).toBeNull();
  });

  it('primer publish (sin publicado) marca `isFirstPublish=true` y cuenta todo lo del draft como añadido', () => {
    const draft = {
      resources: [
        { name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'float' }] },
      ],
      endpoints: [{ path: '/orders', resource: 'orders', methods: ['GET'] }],
      auth: { userAuthEnabled: false },
      websocket: { channels: [] },
    };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: null });
    expect(diff.isFirstPublish).toBe(true);
    expect(diff.resources.added).toBe(1);
    expect(diff.endpoints.added).toBe(1);
    // Fields de resources nuevos no se re-cuentan en el bloque `fields` (evita doble conteo).
    expect(diff.fields.added).toBe(0);
    expect(diff.total).toBeGreaterThanOrEqual(2);
  });

  it('cuenta fields añadidos SOLO sobre resources compartidos (por name)', () => {
    const published = {
      resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'float' }] }],
      endpoints: [], auth: {}, websocket: { channels: [] },
    };
    const draft = {
      resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [
        { id: 'f1', name: 'total', type: 'float' },
        { id: 'f2', name: 'note', type: 'string' },
      ] }],
      endpoints: [], auth: {}, websocket: { channels: [] },
    };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: published });
    expect(diff.isFirstPublish).toBe(false);
    expect(diff.resources).toEqual({ added: 0, removed: 0, modified: 0 });
    expect(diff.fields).toEqual({ added: 1, removed: 0, modified: 0 });
  });

  it('detecta field modificado por mismo id + cambio de type', () => {
    const published = {
      resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'float' }] }],
      endpoints: [], auth: {}, websocket: { channels: [] },
    };
    const draft = {
      resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'string' }] }],
      endpoints: [], auth: {}, websocket: { channels: [] },
    };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: published });
    expect(diff.fields.modified).toBe(1);
  });

  it('detecta resource modificado por cambio de physicalName y NO recuenta sus fields', () => {
    const published = {
      resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'float' }] }],
      endpoints: [], auth: {}, websocket: { channels: [] },
    };
    const draft = {
      resources: [{ name: 'orders', physicalName: 'orders_v2', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'float' }] }],
      endpoints: [], auth: {}, websocket: { channels: [] },
    };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: published });
    expect(diff.resources.modified).toBe(1);
    expect(diff.fields).toEqual({ added: 0, removed: 0, modified: 0 });
  });

  it('endpoints: mismo path con distintos methods → modificado', () => {
    const published = { resources: [], endpoints: [{ path: '/x', resource: 'x', methods: ['GET'] }], auth: {}, websocket: { channels: [] } };
    const draft = { resources: [], endpoints: [{ path: '/x', resource: 'x', methods: ['GET', 'POST'] }], auth: {}, websocket: { channels: [] } };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: published });
    expect(diff.endpoints.modified).toBe(1);
  });

  it('auth: cambiar userAuthEnabled o strategies marca `auth.changed=true`', () => {
    const published = { resources: [], endpoints: [], auth: { userAuthEnabled: false, strategies: [], redirectUris: [] }, websocket: { channels: [] } };
    const draft = { resources: [], endpoints: [], auth: { userAuthEnabled: true, strategies: ['local'], redirectUris: [] }, websocket: { channels: [] } };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: published });
    expect(diff.auth.changed).toBe(true);
  });

  it('websocket: canal añadido cuenta como `added`', () => {
    const published = { resources: [], endpoints: [], auth: {}, websocket: { channels: [] } };
    const draft = { resources: [], endpoints: [], auth: {}, websocket: { channels: [{ name: 'user_to_user', enabled: true, mode: 'public' }] } };
    const diff = summarizeContractChanges({ draftSchema: draft, publishedSchema: published });
    expect(diff.websocket.added).toBe(1);
  });

  it('sin diferencias reales → total=0 y auth.changed=false', () => {
    const same = {
      resources: [{ name: 'orders', physicalName: 'orders_db', store: 'sql', fields: [{ id: 'f1', name: 'total', type: 'float' }] }],
      endpoints: [{ path: '/orders', resource: 'orders', methods: ['GET'] }],
      auth: { userAuthEnabled: false, strategies: [], redirectUris: [] },
      websocket: { channels: [] },
    };
    const diff = summarizeContractChanges({ draftSchema: same, publishedSchema: same });
    expect(diff.total).toBe(0);
    expect(diff.auth.changed).toBe(false);
  });
});
