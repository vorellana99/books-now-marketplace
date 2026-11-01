import { CUSTOMERS, DEV_PASSWORD, USERS } from '../../../prisma/seed-data.js';
import { Email } from '../../../src/contexts/identity/domain/model/user/email.vo.js';
import { PasswordPolicy } from '../../../src/contexts/identity/domain/model/user/password-policy.js';
import { ROLES } from '../../../src/shared-kernel/role.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('datos de ejemplo del seed: usuarios', () => {
  it('la contraseña de desarrollo cumple la política (el login real la acepta)', () => {
    for (const user of USERS) {
      expect(() =>
        PasswordPolicy.assert(DEV_PASSWORD, user.email),
      ).not.toThrow();
    }
  });

  it('cada cliente de ejemplo es un comprador con su mismo id y correo', () => {
    for (const customer of CUSTOMERS) {
      expect(USERS).toContainEqual({
        id: customer.id,
        email: customer.email,
        role: 'BUYER',
      });
    }
  });

  it('hay exactamente un administrador, que no es un cliente', () => {
    const admins = USERS.filter((u) => u.role === 'ADMIN');
    expect(admins).toHaveLength(1);
    expect(CUSTOMERS.map((c) => c.id)).not.toContain(admins[0].id);
    expect(CUSTOMERS.map((c) => c.email)).not.toContain(admins[0].email);
  });

  it('los ids, los correos y los roles son válidos y no se repiten', () => {
    expect(new Set(USERS.map((u) => u.id)).size).toBe(USERS.length);
    expect(new Set(USERS.map((u) => u.email)).size).toBe(USERS.length);
    for (const user of USERS) {
      expect(user.id).toMatch(UUID);
      expect(Email.create(user.email).value).toBe(user.email);
      expect(ROLES).toContain(user.role);
    }
  });
});
