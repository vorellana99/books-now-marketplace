import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PasswordPolicy,
} from '../../../src/contexts/identity/domain/password-policy.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};

describe('PasswordPolicy: qué contraseña se acepta', () => {
  it('admite de 10 a 128 caracteres', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(MAX_PASSWORD_LENGTH).toBe(128);
    expect(() => PasswordPolicy.assert('x7Kq2mVn9p')).not.toThrow();
    expect(() => PasswordPolicy.assert('x'.repeat(9) + 'Q')).not.toThrow();
    expect(failure(() => PasswordPolicy.assert('x7Kq2mVn9'))?.code).toBe(
      'WEAK_PASSWORD',
    ); // 9
    const longest = `${'aB3'.repeat(42)}ab`; // 128
    expect(longest).toHaveLength(128);
    expect(() => PasswordPolicy.assert(longest)).not.toThrow();
    expect(failure(() => PasswordPolicy.assert(`${longest}x`))?.code).toBe(
      'WEAK_PASSWORD',
    ); // 129
  });

  it('no impone reglas de composición: una frase en minúsculas vale', () => {
    expect(() =>
      PasswordPolicy.assert('mi libro favorito es este'),
    ).not.toThrow();
    expect(() => PasswordPolicy.assert('soloMinusculasyletras')).not.toThrow();
  });

  it('no recorta: los espacios cuentan y forman parte de la contraseña', () => {
    expect(() => PasswordPolicy.assert('          a')).not.toThrow(); // 10 espacios + a: 11 caracteres
    expect(failure(() => PasswordPolicy.assert('a b c d e '))).toBeUndefined(); // 10 caracteres con espacios
  });

  it('acepta acentos, ñ, emojis y otros alfabetos', () => {
    expect(() => PasswordPolicy.assert('contraseña-ñandú-2026')).not.toThrow();
    expect(() =>
      PasswordPolicy.assert('パスワードは長いほうがいい'),
    ).not.toThrow();
  });

  it.each([
    '1234567890',
    '0123456789',
    'qwertyuiop',
    'password12',
    'Password123',
    'CONTRASEÑA1',
    'contrasena1',
    'libroya123',
    'Administrator',
  ])('rechaza la contraseña común %s', (password) => {
    expect(failure(() => PasswordPolicy.assert(password))?.code).toBe(
      'WEAK_PASSWORD',
    );
  });

  it.each(['aaaaaaaaaa', 'zzzzzzzzzzzzzz', '0000000000'])(
    'rechaza un solo carácter repetido (%s)',
    (password) => {
      expect(failure(() => PasswordPolicy.assert(password))?.code).toBe(
        'WEAK_PASSWORD',
      );
    },
  );

  it('rechaza una contraseña igual al correo, con o sin mayúsculas', () => {
    expect(
      failure(() =>
        PasswordPolicy.assert('ana.perez@example.com', 'ana.perez@example.com'),
      )?.code,
    ).toBe('WEAK_PASSWORD');
    expect(
      failure(() =>
        PasswordPolicy.assert('ANA.PEREZ@EXAMPLE.COM', 'ana.perez@example.com'),
      )?.code,
    ).toBe('WEAK_PASSWORD');
    expect(() =>
      PasswordPolicy.assert('ana.perez@example.com', 'luis@example.com'),
    ).not.toThrow();
  });

  it.each([null, undefined, 1234567890, {}, ['x7Kq2mVn9p']])(
    'rechaza lo que no es texto (%j)',
    (value) => {
      expect(failure(() => PasswordPolicy.assert(value as never))?.code).toBe(
        'WEAK_PASSWORD',
      );
    },
  );

  it('el mensaje dice qué falta, pero nunca repite la contraseña', () => {
    const error = failure(() => PasswordPolicy.assert('secreto'));
    expect(error?.message).toMatch(/10/);
    expect(error?.message).not.toContain('secreto');
    const common = failure(() => PasswordPolicy.assert('password123'));
    expect(common?.message).not.toContain('password123');
  });
});
