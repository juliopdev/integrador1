import { describe, it, expect } from 'vitest';
import { parseRolePermissions, combineRolePermissions } from '../domain/parse-role-permissions.js';

/**
 * Iter 54b: el helper decide qué tiles ve un Staff en el home.
 * Falla-seguro: cualquier JSON inválido o falta de rol → todos los flags en `false`.
 */
describe('parseRolePermissions', () => {
  it('role=null → todos los flags false', () => {
    expect(parseRolePermissions(null)).toEqual({
      hasReadAccess: false, hasAnyDataAccess: false, isSupport: false,
    });
  });

  it('name="support" → isSupport=true aunque no tenga permisos', () => {
    const role = { name: 'support', permissionsJson: '{}' };
    expect(parseRolePermissions(role)).toEqual({
      hasReadAccess: false, hasAnyDataAccess: false, isSupport: true,
    });
  });

  it('name="Support" (mayúsculas) → matchea case-insensitive', () => {
    const role = { name: 'Support', permissionsJson: '{}' };
    expect(parseRolePermissions(role).isSupport).toBe(true);
  });

  it('solo GET → hasReadAccess=true y hasAnyDataAccess=true', () => {
    const role = { name: 'lectura', permissionsJson: JSON.stringify({ v1: { products: ['GET'] } }) };
    expect(parseRolePermissions(role)).toEqual({
      hasReadAccess: true, hasAnyDataAccess: true, isSupport: false,
    });
  });

  it('solo POST → hasAnyDataAccess=true pero hasReadAccess=false', () => {
    const role = { name: 'writer', permissionsJson: JSON.stringify({ v1: { products: ['POST'] } }) };
    expect(parseRolePermissions(role)).toEqual({
      hasReadAccess: false, hasAnyDataAccess: true, isSupport: false,
    });
  });

  it('permissionsJson corrupto → falla-seguro (todos false)', () => {
    const role = { name: 'bad', permissionsJson: 'not-json {[' };
    expect(parseRolePermissions(role)).toEqual({
      hasReadAccess: false, hasAnyDataAccess: false, isSupport: false,
    });
  });

  it('permissionsJson vacío/undefined → default {} → sin data access', () => {
    expect(parseRolePermissions({ name: 'x' }).hasAnyDataAccess).toBe(false);
    expect(parseRolePermissions({ name: 'x', permissionsJson: null }).hasAnyDataAccess).toBe(false);
  });

  it('múltiples versiones y recursos → agrega OR', () => {
    const role = { name: 'multi', permissionsJson: JSON.stringify({
      v1: { products: ['GET'], orders: ['POST'] },
      v2: { customers: ['PUT'] },
    }) };
    expect(parseRolePermissions(role)).toEqual({
      hasReadAccess: true, hasAnyDataAccess: true, isSupport: false,
    });
  });

  it('verbos no-array o basura → ignorados sin throw', () => {
    const role = { name: 'weird', permissionsJson: JSON.stringify({
      v1: { products: 'GET', orders: null },
    }) };
    expect(parseRolePermissions(role)).toEqual({
      hasReadAccess: false, hasAnyDataAccess: false, isSupport: false,
    });
  });
});

describe('combineRolePermissions', () => {
  it('array vacío o null → todos false', () => {
    expect(combineRolePermissions([])).toEqual({
      hasReadAccess: false, hasAnyDataAccess: false, isSupport: false,
    });
    expect(combineRolePermissions(null)).toEqual({
      hasReadAccess: false, hasAnyDataAccess: false, isSupport: false,
    });
  });

  it('OR: role1 con GET + role2 con "support" → ambos flags encendidos', () => {
    const rows = [
      { name: 'reader', permissionsJson: JSON.stringify({ v1: { products: ['GET'] } }) },
      { name: 'support', permissionsJson: '{}' },
    ];
    expect(combineRolePermissions(rows)).toEqual({
      hasReadAccess: true, hasAnyDataAccess: true, isSupport: true,
    });
  });
});
