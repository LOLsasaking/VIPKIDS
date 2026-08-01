import {
  DEMO_PASSWORD,
  demoChildren,
  demoDrivers,
  demoParents,
  demoRoleForCredentials,
  demoTokenFor,
  demoVehicles,
  isDemoToken,
} from '@/src/demo';

describe('reviewer demo fleet', () => {
  test('contains the requested realistic operating sample', () => {
    expect(demoDrivers).toHaveLength(10);
    expect(demoParents).toHaveLength(10);
    expect(demoChildren).toHaveLength(12);
    expect(demoVehicles).toHaveLength(10);
    expect(new Set(demoVehicles.map((vehicle) => vehicle.model)).size).toBe(10);
  });

  test('accepts only the documented demo password and email', () => {
    expect(demoRoleForCredentials(' PARENT.DEMO@VIPKIDSTEST.COM ', DEMO_PASSWORD)).toBe('parent');
    expect(demoRoleForCredentials('parent.demo@vipkidstest.com', 'wrong-password')).toBeNull();
  });

  test('recognizes role-scoped demo tokens', () => {
    const token = demoTokenFor('driver');
    expect(isDemoToken(token)).toBe(true);
    expect(isDemoToken('untrusted')).toBe(false);
  });
});
