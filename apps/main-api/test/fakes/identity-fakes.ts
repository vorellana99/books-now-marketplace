import { AccessTokenIssuer } from '../../src/contexts/identity/application/access-token-issuer.js';
import { PasswordHasher } from '../../src/contexts/identity/domain/ports/password-hasher.port.js';
import type { Role } from '../../src/shared-kernel/role.js';

// Un hasher sin costo: el «hash» es la contraseña con un prefijo. Cuenta cuántas veces se le pidió cada cosa
export class FakeHasher extends PasswordHasher {
  readonly hashed: string[] = [];
  readonly verified: { plain: string; stored: string }[] = [];

  hash(plain: string): Promise<string> {
    this.hashed.push(plain);
    return Promise.resolve(`fake$${plain}`);
  }

  verify(plain: string, stored: string): Promise<boolean> {
    this.verified.push({ plain, stored });
    return Promise.resolve(stored === `fake$${plain}`);
  }
}

// Un emisor de tokens de acceso que deja ver para quién y con qué rol se emitió
export class FakeAccessTokenIssuer extends AccessTokenIssuer {
  readonly issued: { id: string; role: Role }[] = [];
  failWith: Error | null = null;

  issue(user: { id: string; role: Role }) {
    if (this.failWith) return Promise.reject(this.failWith);
    this.issued.push(user);
    return Promise.resolve({
      token: `access:${user.id}:${user.role}`,
      expiresInSeconds: 900,
    });
  }
}
