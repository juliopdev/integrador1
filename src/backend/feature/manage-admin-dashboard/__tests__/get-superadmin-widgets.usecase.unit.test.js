import { describe, it, expect, vi } from 'vitest';
import { makeGetSuperadminWidgets } from '../application/get-superadmin-widgets.usecase.js';

describe('get-superadmin-widgets.usecase', () => {
  it('agrega health + counts + errores + actividad en un solo snapshot', async () => {
    const health = { system: { uptimeSec: 999 }, storage: {}, platform: {} };
    const counts = {
      tenants: { active: 3, suspended: 1, softDeleted: 0 },
      superadmins: 1, memberships: 2,
      frontends: { hosted: 0, external: 1 }, backends: null,
    };
    const errorRows = [{ id: 'e1', level: 'error', message: 'boom', createdAt: 100 }];
    const activityRows = [
      { id: 'a1', event: 'created', createdAt: 200, subdomain: 'shop', kind: 'tenant.created', message: 'Se creó `shop`' },
      { id: 'a2', event: 'disabled', createdAt: 150, subdomain: 'demo', kind: 'tenant.disabled', message: 'Se suspendió `demo`' },
    ];

    const getHealth = vi.fn(async () => health);
    const healthRepository = {
      counts: vi.fn(() => counts),
      readRecentErrors: vi.fn(() => errorRows),
      readRecentActivity: vi.fn(() => activityRows),
    };

    const usecase = makeGetSuperadminWidgets({ getHealth, healthRepository });
    const result = await usecase();

    expect(getHealth).toHaveBeenCalledOnce();
    expect(healthRepository.counts).toHaveBeenCalledOnce();
    expect(healthRepository.readRecentErrors).toHaveBeenCalledOnce();
    expect(healthRepository.readRecentActivity).toHaveBeenCalledOnce();
    expect(result.health).toBe(health);
    expect(result.counts).toBe(counts);
    expect(result.recentErrors).toEqual(errorRows);
    expect(result.recentActivity).toHaveLength(2);
    expect(result.recentActivity[0]).toMatchObject({ kind: 'tenant.created', subdomain: 'shop' });
    expect(result.recentActivity[1]).toMatchObject({ kind: 'tenant.disabled', subdomain: 'demo' });
  });

  it('actividad vacía → arrays vacíos (no revienta ni tira warnings)', async () => {
    const healthRepository = {
      counts: () => ({
        tenants: { active: 0, suspended: 0, softDeleted: 0 },
        superadmins: 0, memberships: 0,
        frontends: { hosted: 0, external: 0 }, backends: null,
      }),
      readRecentErrors: () => [],
      readRecentActivity: () => [],
    };
    const usecase = makeGetSuperadminWidgets({
      getHealth: async () => ({ system: {}, storage: {}, platform: {} }),
      healthRepository,
    });
    const result = await usecase();
    expect(result.recentErrors).toEqual([]);
    expect(result.recentActivity).toEqual([]);
  });

  it('evento con `event` desconocido → mensaje genérico "Evento X sobre …"', async () => {
    const healthRepository = {
      counts: () => ({
        tenants: { active: 0, suspended: 0, softDeleted: 0 },
        superadmins: 0, memberships: 0,
        frontends: { hosted: 0, external: 0 }, backends: null,
      }),
      readRecentErrors: () => [],
      readRecentActivity: () => [
        { id: 'x', event: 'weird_thing', createdAt: 1, subdomain: 'foo', kind: 'tenant.weird_thing', message: 'Evento weird_thing sobre `foo`' },
      ],
    };
    const usecase = makeGetSuperadminWidgets({
      getHealth: async () => ({ system: {}, storage: {}, platform: {} }),
      healthRepository,
    });
    const result = await usecase();
    expect(result.recentActivity[0].message).toMatch(/^Evento weird_thing sobre/);
  });
});
