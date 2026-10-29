import crypto, { randomBytes, scryptSync } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { PasswordHasher } from '../../../src/contexts/identity/domain/ports/password-hasher.port.js';
import {
  DEFAULT_LOG_N,
  ScryptPasswordHasher,
} from '../../../src/contexts/identity/infrastructure/adapters/scrypt-password-hasher.js';

// Costo mínimo para que los tests no esperen: el valor por defecto (seguro) se comprueba aparte
const fast = () => new ScryptPasswordHasher({ logN: 4 });

describe('ScryptPasswordHasher', () => {
  it('es un PasswordHasher', () => {
    expect(fast()).toBeInstanceOf(PasswordHasher);
  });

  describe('el hash', () => {
    it('lleva sus parámetros, la sal y el resultado, separados por $', async () => {
      const hash = await fast().hash('una contraseña larga');
      const [scheme, logN, r, p, salt, derived] = hash.split('$');
      expect(scheme).toBe('scrypt');
      expect([logN, r, p]).toEqual(['4', '8', '3']);
      expect(Buffer.from(salt, 'base64url')).toHaveLength(16);
      expect(Buffer.from(derived, 'base64url')).toHaveLength(32);
    });

    it('no contiene la contraseña', async () => {
      const hash = await fast().hash('una contraseña larga');
      expect(hash).not.toContain('contraseña');
      expect(Buffer.from(hash).toString('latin1')).not.toContain(
        'contraseña larga',
      );
    });

    it('la misma contraseña da hashes distintos: cada uno lleva su propia sal', async () => {
      const hasher = fast();
      const [a, b] = await Promise.all([
        hasher.hash('misma contraseña'),
        hasher.hash('misma contraseña'),
      ]);
      expect(a).not.toBe(b);
      expect(a.split('$')[4]).not.toBe(b.split('$')[4]);
    });

    it('por defecto usa los parámetros seguros: N = 2^15, r = 8, p = 3', async () => {
      expect(DEFAULT_LOG_N).toBe(15);
      const hash = await new ScryptPasswordHasher().hash(
        'una contraseña larga',
      );
      expect(hash.startsWith('scrypt$15$8$3$')).toBe(true);
    });

    it.each([3, 21, 4.5, Number.NaN])(
      'rechaza un costo fuera de rango al crearlo (%s)',
      (logN) => {
        expect(() => new ScryptPasswordHasher({ logN })).toThrow(/costo/i);
      },
    );
  });

  describe('verify', () => {
    it('acepta la contraseña correcta y rechaza cualquier otra', async () => {
      const hasher = fast();
      const hash = await hasher.hash('una contraseña larga');
      expect(await hasher.verify('una contraseña larga', hash)).toBe(true);
      expect(await hasher.verify('una contraseña larga ', hash)).toBe(false);
      expect(await hasher.verify('Una contraseña larga', hash)).toBe(false);
      expect(await hasher.verify('', hash)).toBe(false);
    });

    it('distingue contraseñas con acentos y con caracteres fuera del alfabeto latino', async () => {
      const hasher = fast();
      const hash = await hasher.hash('contraseña-ñandú-パスワード');
      expect(await hasher.verify('contraseña-ñandú-パスワード', hash)).toBe(
        true,
      );
      expect(await hasher.verify('contrasena-nandu-パスワード', hash)).toBe(
        false,
      );
    });

    // "ñ" se puede escribir de dos formas (un carácter, o n + una tilde suelta) según el teclado o el sistema: es la misma
    // contraseña, y se normaliza (NFKC) antes de derivar la clave
    it('la misma contraseña escrita con otra forma Unicode sigue siendo la misma', async () => {
      const hasher = fast();
      const composed = 'contraseña larga'.normalize('NFC');
      const decomposed = 'contraseña larga'.normalize('NFD');
      expect(decomposed).not.toBe(composed);
      expect(await hasher.verify(decomposed, await hasher.hash(composed))).toBe(
        true,
      );
      expect(await hasher.verify(composed, await hasher.hash(decomposed))).toBe(
        true,
      );
    });

    it('verifica con los parámetros guardados en el hash, no con los del hasher actual', async () => {
      const old = new ScryptPasswordHasher({ logN: 4 });
      const hash = await old.hash('una contraseña larga');
      const stronger = new ScryptPasswordHasher({ logN: 6 });
      expect(await stronger.verify('una contraseña larga', hash)).toBe(true);
    });

    it('compara en tiempo constante: usa timingSafeEqual', async () => {
      const hasher = fast();
      const hash = await hasher.hash('una contraseña larga');
      const spy = vi.spyOn(crypto, 'timingSafeEqual');
      syncBuiltinESMExports();
      try {
        await hasher.verify('una contraseña larga', hash);
        await hasher.verify('otra contraseña', hash);
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        spy.mockRestore();
        syncBuiltinESMExports();
      }
    });

    it.each([
      ['vacío', ''],
      ['texto cualquiera', 'hola'],
      ['otro esquema', 'bcrypt$4$8$3$c2FsdA$aGFzaA'],
      ['faltan partes', 'scrypt$4$8$3$c2FsdA'],
      ['sobran partes', 'scrypt$4$8$3$c2FsdA$aGFzaA$extra'],
      ['parámetros que no son números', 'scrypt$x$8$3$c2FsdA$aGFzaA'],
      ['sal vacía', 'scrypt$4$8$3$$aGFzaA'],
      ['resultado vacío', 'scrypt$4$8$3$c2FsdA$'],
      ['costo por debajo del mínimo', 'scrypt$2$8$3$c2FsdA$aGFzaA'],
    ])(
      'un hash guardado mal formado (%s) no se acepta y no lanza',
      async (_caso, stored) => {
        await expect(
          fast().verify('una contraseña larga', stored),
        ).resolves.toBe(false);
      },
    );

    // Los casos de arriba fallan ya por alguna otra comprobación; estos tienen todo válido salvo UNA cosa, para que cada
    // comprobación se pruebe sola
    describe('un hash con todo válido salvo una cosa', () => {
      const params = { N: 2 ** 4, r: 8, p: 3 };
      const forged = (parts: {
        scheme?: string;
        salt?: Buffer;
        result?: Buffer;
      }) => {
        const salt = parts.salt ?? randomBytes(16);
        const result =
          parts.result ??
          scryptSync(
            'una contraseña larga'.normalize('NFKC'),
            salt,
            32,
            params,
          );
        return `${parts.scheme ?? 'scrypt'}$4$8$3$${salt.toString('base64url')}$${result.toString('base64url')}`;
      };

      // Un hash CORRECTO para la contraseña, pero con un parámetro fuera del rango que se acepta al verificar: el parámetro
      // sale del hash guardado y no puede decidir cuánta memoria o CPU se gasta
      const withParams = (logN: number, r: number, p: number) => {
        const salt = randomBytes(16);
        const key = scryptSync(
          'una contraseña larga'.normalize('NFKC'),
          salt,
          32,
          {
            N: 2 ** logN,
            r,
            p,
            maxmem: 1100 * 1024 * 1024,
          },
        );
        return `scrypt$${logN}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
      };

      it.each([
        ['p por encima del máximo (17)', withParams(4, 8, 17)],
        ['r por encima del máximo (17)', withParams(4, 17, 1)],
        ['costo por debajo del mínimo (N = 2^3)', withParams(3, 8, 3)],
        ['costo por encima del máximo (N = 2^21)', withParams(21, 2, 1)],
      ])('un hash correcto con %s no se acepta', async (_caso, stored) => {
        await expect(
          fast().verify('una contraseña larga', stored),
        ).resolves.toBe(false);
      });

      it('los extremos permitidos sí verifican (r = 16, p = 16, N = 2^4)', async () => {
        await expect(
          fast().verify('una contraseña larga', withParams(4, 16, 16)),
        ).resolves.toBe(true);
      });

      it('el control: con todo válido, verifica', async () => {
        await expect(
          fast().verify('una contraseña larga', forged({})),
        ).resolves.toBe(true);
      });

      it('otro esquema, aunque el resto sea correcto', async () => {
        await expect(
          fast().verify('una contraseña larga', forged({ scheme: 'bcrypt' })),
        ).resolves.toBe(false);
      });

      it('sal vacía, aunque el resultado sea el de esa sal', async () => {
        const salt = Buffer.alloc(0);
        await expect(
          fast().verify('una contraseña larga', forged({ salt })),
        ).resolves.toBe(false);
      });

      it('un resultado más corto que el esperado', async () => {
        await expect(
          fast().verify(
            'una contraseña larga',
            forged({ result: Buffer.from('corto') }),
          ),
        ).resolves.toBe(false);
      });

      it('un resultado más largo que el esperado', async () => {
        const longer = Buffer.concat([
          scryptSync(
            'una contraseña larga'.normalize('NFKC'),
            Buffer.alloc(16),
            32,
            params,
          ),
          Buffer.from('x'),
        ]);
        await expect(
          fast().verify('una contraseña larga', forged({ result: longer })),
        ).resolves.toBe(false);
      });
    });

    it('un hash con parámetros desmesurados se rechaza al instante, sin gastar memoria ni CPU', async () => {
      const salt = randomBytes(16).toString('base64url');
      const stored = `scrypt$40$8$3$${salt}$${scryptSync('x', salt, 32, { N: 16, r: 8, p: 1 }).toString('base64url')}`;
      const started = Date.now();
      await expect(fast().verify('x', stored)).resolves.toBe(false);
      expect(Date.now() - started).toBeLessThan(1_000);
      await expect(
        fast().verify('x', `scrypt$4$8$999$${salt}$aGFzaA`),
      ).resolves.toBe(false);
      await expect(
        fast().verify('x', `scrypt$4$1024$3$${salt}$aGFzaA`),
      ).resolves.toBe(false);
    });

    it('rechaza una contraseña que no es texto', async () => {
      const hasher = fast();
      const hash = await hasher.hash('una contraseña larga');
      await expect(hasher.verify(undefined as never, hash)).resolves.toBe(
        false,
      );
      await expect(hasher.verify(123 as never, hash)).resolves.toBe(false);
    });
  });

  it('hash lanza si no recibe texto', async () => {
    await expect(fast().hash(undefined as never)).rejects.toThrow();
  });

  it('un hash de otra instancia y de otra sal sigue verificando (nada depende del estado del hasher)', async () => {
    const hash = await fast().hash('una contraseña larga');
    expect(await fast().verify('una contraseña larga', hash)).toBe(true);
  });
});
