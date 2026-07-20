import { describe, it, expect, vi } from 'vitest';
import { makeGetTenantWidgets } from '../application/get-tenant-widgets.usecase.js';

// Un timestamp fijo para las queries de "hoy" — 2026-07-10 12:00 UTC.
const NOW = new Date('2026-07-10T12:00:00Z').getTime();
const now = () => NOW;

describe('get-tenant-widgets.usecase — agnóstico del dominio + widgets Iter 54b', () => {
  it('contract + providers + counts + activity + team + webHealth', async () => {
    const dashboardRepository = {
      readContract: vi.fn(() => ({
        isPublished: true, version: 'v1', resourceCount: 3, publishedAt: 100,
      })),
      readProvidersActive: vi.fn(() => [
        { category: 'database', provider: 'mongodb-atlas' },
        { category: 'auth', provider: 'local' },
      ]),
      readCounts: vi.fn(() => ({
        endUsers: 10, staff: 2, notificationsPublished: 5,
        usersJoinedToday: 3, usersRemovedToday: 1,
      })),
      readRecentActivity: vi.fn(() => [
        { kind: 'notification.published', message: 'Publicaste "Nueva versión"', at: NOW - 3000 },
        { kind: 'user.joined', message: 'ju***@shop.com se unió', at: NOW - 4000 },
      ]),
      readTeamAttendance: vi.fn(() => [
        { email: 'ma***@shop.com', updatedAt: NOW - 200, status: 'active' },
      ]),
      readUserPermissions: vi.fn(() => ({
        hasReadAccess: true, hasAnyDataAccess: true, isSupport: false,
      })),
    };

    const result = await makeGetTenantWidgets({ dashboardRepository, db: '__mock__', now })();

    expect(dashboardRepository.readContract).toHaveBeenCalledWith('__mock__');
    expect(dashboardRepository.readProvidersActive).toHaveBeenCalledWith('__mock__');
    expect(dashboardRepository.readCounts).toHaveBeenCalledWith('__mock__', NOW);
    expect(dashboardRepository.readRecentActivity).toHaveBeenCalledWith('__mock__', NOW);
    expect(dashboardRepository.readTeamAttendance).toHaveBeenCalledWith('__mock__');

    expect(result.contract).toEqual({ isPublished: true, version: 'v1', resourceCount: 3, publishedAt: 100 });
    expect(result.counts).toEqual({
      endUsers: 10, staff: 2, notificationsPublished: 5,
      usersJoinedToday: 3, usersRemovedToday: 1,
    });
    expect(result.webHealth.userAuthEnabled).toBe(true);
    expect(result.webHealth.providersActive).toHaveLength(2);
    expect(result.teamAttendance).toHaveLength(1);
    expect(result.teamAttendance[0].email).toBe('ma***@shop.com');
    expect(result.recentActivity[0].message).toContain('Nueva versión');
  });

  it('sin contrato + sin providers → webHealth con isPublished=false + userAuthEnabled=false', async () => {
    const dashboardRepository = {
      readContract: vi.fn(() => ({ isPublished: false, version: null, resourceCount: 0 })),
      readProvidersActive: vi.fn(() => []),
      readCounts: vi.fn(() => ({
        endUsers: 0, staff: 0, notificationsPublished: 0,
        usersJoinedToday: 0, usersRemovedToday: 0,
      })),
      readRecentActivity: vi.fn(() => []),
      readTeamAttendance: vi.fn(() => []),
      readUserPermissions: vi.fn(() => null),
    };
    const result = await makeGetTenantWidgets({ dashboardRepository, db: null, now })();
    expect(result.contract.isPublished).toBe(false);
    expect(result.webHealth.userAuthEnabled).toBe(false);
    expect(result.webHealth.providersActive).toEqual([]);
    expect(result.counts.usersJoinedToday).toBe(0);
    expect(result.counts.usersRemovedToday).toBe(0);
    expect(result.teamAttendance).toEqual([]);
  });

  it('schemaJson corrupto → resourceCount=0, sin throw', async () => {
    const dashboardRepository = {
      readContract: vi.fn(() => {
        // Simula lo que el repository hace internamente con JSON corrupto
        return { isPublished: true, version: 'v1', resourceCount: 0, publishedAt: 100 };
      }),
      readProvidersActive: vi.fn(() => []),
      readCounts: vi.fn(() => ({
        endUsers: 0, staff: 0, notificationsPublished: 0,
        usersJoinedToday: 0, usersRemovedToday: 0,
      })),
      readRecentActivity: vi.fn(() => []),
      readTeamAttendance: vi.fn(() => []),
    };
    const result = await makeGetTenantWidgets({ dashboardRepository, db: null, now })();
    expect(result.contract.isPublished).toBe(true);
    expect(result.contract.resourceCount).toBe(0);
  });

  it('endUsers = totalUsers − staff (clamp a ≥0 si hay race)', async () => {
    const dashboardRepository = {
      readContract: vi.fn(() => ({ isPublished: false, version: null, resourceCount: 0 })),
      readProvidersActive: vi.fn(() => []),
      readCounts: vi.fn(() => ({
        endUsers: 0, staff: 20, notificationsPublished: 0,
        usersJoinedToday: 0, usersRemovedToday: 0,
      })),
      readRecentActivity: vi.fn(() => []),
      readTeamAttendance: vi.fn(() => []),
    };
    const result = await makeGetTenantWidgets({ dashboardRepository, db: null, now })();
    expect(result.counts.endUsers).toBe(0);
    expect(result.counts.staff).toBe(20);
  });

  it('con `userId` → carga los permisos del user', async () => {
    const dashboardRepository = {
      readContract: vi.fn(() => ({ isPublished: false, version: null, resourceCount: 0 })),
      readProvidersActive: vi.fn(() => []),
      readCounts: vi.fn(() => ({
        endUsers: 0, staff: 0, notificationsPublished: 0,
        usersJoinedToday: 0, usersRemovedToday: 0,
      })),
      readRecentActivity: vi.fn(() => []),
      readTeamAttendance: vi.fn(() => []),
      readUserPermissions: vi.fn(() => ({
        hasReadAccess: true, hasAnyDataAccess: true, isSupport: false,
      })),
    };
    const result = await makeGetTenantWidgets({ dashboardRepository, db: null, now })({ userId: 'u1' });
    expect(dashboardRepository.readUserPermissions).toHaveBeenCalledWith(null, 'u1');
    expect(result.permissions).toEqual({
      hasReadAccess: true, hasAnyDataAccess: true, isSupport: false,
    });
  });

  it('sin userId → permissions es null', async () => {
    const dashboardRepository = {
      readContract: vi.fn(() => ({ isPublished: false, version: null, resourceCount: 0 })),
      readProvidersActive: vi.fn(() => []),
      readCounts: vi.fn(() => ({
        endUsers: 0, staff: 0, notificationsPublished: 0,
        usersJoinedToday: 0, usersRemovedToday: 0,
      })),
      readRecentActivity: vi.fn(() => []),
      readTeamAttendance: vi.fn(() => []),
      readUserPermissions: vi.fn(),
    };
    const result = await makeGetTenantWidgets({ dashboardRepository, db: null, now })();
    expect(result.permissions).toBeNull();
    expect(dashboardRepository.readUserPermissions).not.toHaveBeenCalled();
  });
});
