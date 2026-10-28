import {
  generateRefreshToken,
  hashRefreshToken,
  isWellFormedRefreshToken,
} from '../../src/contexts/identity/infrastructure/refresh-token.js';

describe('refresh-token', () => {
  describe('generateRefreshToken', () => {
    it('es un texto opaco de 43 caracteres url-safe (32 bytes aleatorios)', () => {
      const { token } = generateRefreshToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    });

    it('no se repite', () => {
      const tokens = new Set(
        Array.from({ length: 2000 }, () => generateRefreshToken().token),
      );
      expect(tokens.size).toBe(2000);
    });

    it('devuelve el hash que corresponde al token', () => {
      const { token, hash } = generateRefreshToken();
      expect(hash).toBe(hashRefreshToken(token));
    });

    it('usa todos los bytes: no hay un prefijo ni un relleno fijo', () => {
      const tokens = Array.from(
        { length: 50 },
        () => generateRefreshToken().token,
      );
      for (let i = 0; i < 43; i += 1) {
        expect(new Set(tokens.map((t) => t[i])).size).toBeGreaterThan(1);
      }
    });
  });

  describe('hashRefreshToken', () => {
    it('es un SHA-256 en hexadecimal (64 caracteres)', () => {
      expect(hashRefreshToken('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('es siempre el mismo para el mismo token y distinto para otro', () => {
      expect(hashRefreshToken('uno')).toBe(hashRefreshToken('uno'));
      expect(hashRefreshToken('uno')).not.toBe(hashRefreshToken('dos'));
    });

    it('no contiene el token', () => {
      const { token, hash } = generateRefreshToken();
      expect(hash).not.toContain(token);
    });
  });

  describe('isWellFormedRefreshToken', () => {
    it('acepta uno generado', () => {
      expect(isWellFormedRefreshToken(generateRefreshToken().token)).toBe(true);
    });

    it.each([
      ['vacío', ''],
      ['corto', 'a'.repeat(42)],
      ['largo', 'a'.repeat(44)],
      ['con un carácter que no es url-safe', `${'a'.repeat(42)}+`],
      ['con espacios', `${'a'.repeat(42)} `],
      ['con salto de línea', `${'a'.repeat(42)}\n`],
      ['con relleno de base64', `${'a'.repeat(42)}=`],
    ])('rechaza uno %s', (_why, token) => {
      expect(isWellFormedRefreshToken(token)).toBe(false);
    });

    it.each([undefined, null, 42, {}, ['a'.repeat(43)]])(
      'rechaza lo que no es texto (%j)',
      (value) => {
        expect(isWellFormedRefreshToken(value)).toBe(false);
      },
    );
  });
});
