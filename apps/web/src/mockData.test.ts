import { describe, expect, it } from 'vitest';
import { authenticateDemoUser, buildTemporaryPassword, demoEmployees, demoPasswords } from './mockData';

describe('demo auth and employee admin data', () => {
  it('authenticates an active seeded demo account', () => {
    const result = authenticateDemoUser('ada.admin@example.com', 'admin123', demoEmployees, demoPasswords);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.employee.role).toBe('admin');
    }
  });

  it('rejects inactive accounts even when the password matches', () => {
    const result = authenticateDemoUser('ivy.inactive@example.com', 'inactive123', demoEmployees, demoPasswords);

    expect(result).toEqual({
      ok: false,
      error: 'Inactive employees cannot sign in to the workspace.',
    });
  });

  it('builds a deterministic temporary password for admin resets', () => {
    expect(buildTemporaryPassword('33333333-3333-4333-8333-333333333333')).toBe('Temp-3333-Revu!');
  });
});
