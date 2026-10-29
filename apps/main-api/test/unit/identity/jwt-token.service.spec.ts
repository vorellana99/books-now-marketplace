import { SignJWT } from 'jose';
import { AccessTokenIssuer } from '../../../src/contexts/identity/application/access-token-issuer.js';
import {
  JwtTokenService,
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
} from '../../../src/contexts/identity/infrastructure/jwt-token.service.js';
import {
  AccessTokenVerifier,
  TokenVerificationError,
} from '../../../src/platform/auth/access-token-verifier.js';

const SECRET = 'un-secreto-de-prueba-largo-0123456789-abcdef';
const OTHER_SECRET = 'otro-secreto-de-prueba-largo-9876543210-fedcba';
const USER = '0196a000-0000-7000-8000-0000000000aa';
const NOW = new Date('2026-10-29T12:00:00.000Z');
const TTL = 900;

const key = (secret: string) => new TextEncoder().encode(secret);
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

// Un reloj que el test mueve a mano
function setup(options: { secret?: string; ttl?: number } = {}) {
  const clock = { now: NOW };
  const service = new JwtTokenService({
    secret: options.secret ?? SECRET,
    ttlSeconds: options.ttl ?? TTL,
    clock: () => clock.now,
  });
  return { service, clock };
}

// Un token firmado a mano, con los datos que el test quiera (para forjar ataques)
const forge = (
  claims: Record<string, unknown> = {},
  options: {
    secret?: string;
    alg?: string;
    typ?: string;
    sub?: string | null;
    iss?: string | null;
    aud?: string | null;
    iat?: Date;
    exp?: Date | null;
  } = {},
) => {
  let jwt = new SignJWT({ role: 'BUYER', ...claims })
    .setProtectedHeader({
      alg: options.alg ?? 'HS256',
      typ: options.typ ?? 'JWT',
    })
    .setJti('jti-1')
    .setIssuedAt(seconds(options.iat ?? NOW));
  if (options.sub !== null) jwt = jwt.setSubject(options.sub ?? USER);
  if (options.iss !== null) jwt = jwt.setIssuer(options.iss ?? TOKEN_ISSUER);
  if (options.aud !== null)
    jwt = jwt.setAudience(options.aud ?? TOKEN_AUDIENCE);
  if (options.exp !== null)
    jwt = jwt.setExpirationTime(
      seconds(options.exp ?? new Date(NOW.getTime() + TTL * 1000)),
    );
  return jwt.sign(key(options.secret ?? SECRET));
};
const invalid = async (promise: Promise<unknown>) =>
  (await promise.then(
    () => undefined,
    (e: unknown) => e,
  )) as TokenVerificationError | undefined;
const decode = (token: string) => ({
  header: JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()),
  payload: JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()),
});

describe('JwtTokenService', () => {
  describe('emitir', () => {
    it('es el emisor y el verificador de tokens', () => {
      const { service } = setup();
      expect(service).toBeInstanceOf(JwtTokenService);
      expect(AccessTokenIssuer).toBeDefined();
      expect(AccessTokenVerifier).toBeDefined();
    });

    it('firma con HS256 y lleva solo lo necesario: emisor, audiencia, usuario, rol, fechas e id del token', async () => {
      const { service } = setup();
      const { token } = await service.issue({ id: USER, role: 'BUYER' });
      const { header, payload } = decode(token);
      expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
      expect(Object.keys(payload).sort((a, b) => a.localeCompare(b))).toEqual([
        'aud',
        'exp',
        'iat',
        'iss',
        'jti',
        'role',
        'sub',
      ]);
      expect(payload).toMatchObject({
        iss: TOKEN_ISSUER,
        aud: TOKEN_AUDIENCE,
        sub: USER,
        role: 'BUYER',
      });
    });

    it('no lleva el correo ni ningún otro dato personal', async () => {
      const { service } = setup();
      const { token } = await service.issue({ id: USER, role: 'ADMIN' });
      expect(JSON.stringify(decode(token).payload)).not.toMatch(
        /@|email|password/i,
      );
    });

    it('vence a los ttl segundos y lo dice', async () => {
      const { service } = setup({ ttl: 600 });
      const issued = await service.issue({ id: USER, role: 'BUYER' });
      const { payload } = decode(issued.token);
      expect(payload.iat).toBe(seconds(NOW));
      expect(payload.exp - payload.iat).toBe(600);
      expect(issued.expiresInSeconds).toBe(600);
    });

    it('cada token lleva un id distinto', async () => {
      const { service } = setup();
      const [a, b] = await Promise.all([
        service.issue({ id: USER, role: 'BUYER' }),
        service.issue({ id: USER, role: 'BUYER' }),
      ]);
      expect(decode(a.token).payload.jti).not.toBe(decode(b.token).payload.jti);
    });

    it('lleva el rol que se le indica', async () => {
      const { service } = setup();
      expect(
        decode((await service.issue({ id: USER, role: 'ADMIN' })).token).payload
          .role,
      ).toBe('ADMIN');
    });
  });

  describe('verificar', () => {
    it('devuelve el usuario y el rol de un token que emitió', async () => {
      const { service } = setup();
      const { token } = await service.issue({ id: USER, role: 'ADMIN' });
      expect(await service.verify(token)).toEqual({
        userId: USER,
        role: 'ADMIN',
      });
    });

    it('acepta el token hasta el último segundo y no después (con la tolerancia de reloj)', async () => {
      const { service, clock } = setup();
      const { token } = await service.issue({ id: USER, role: 'BUYER' });

      clock.now = new Date(NOW.getTime() + TTL * 1000 - 1000);
      await expect(service.verify(token)).resolves.toBeDefined();

      clock.now = new Date(NOW.getTime() + TTL * 1000 + 6000); // pasada la tolerancia de 5 s
      const error = await invalid(service.verify(token));
      expect(error).toBeInstanceOf(TokenVerificationError);
      expect(error?.reason).toBe('expired');
    });

    it('tolera hasta 5 segundos de diferencia de reloj, y no más', async () => {
      const { service, clock } = setup();
      const { token } = await service.issue({ id: USER, role: 'BUYER' });
      clock.now = new Date(NOW.getTime() + TTL * 1000 + 4000);
      await expect(service.verify(token)).resolves.toBeDefined();
      clock.now = new Date(NOW.getTime() + TTL * 1000 + 6000);
      expect((await invalid(service.verify(token)))?.reason).toBe('expired');
    });

    it('rechaza un token emitido en el futuro (reloj más allá de la tolerancia)', async () => {
      const { service } = setup();
      const token = await forge(
        {},
        {
          iat: new Date(NOW.getTime() + 60_000),
          exp: new Date(NOW.getTime() + 60_000 + TTL * 1000),
        },
      );
      expect((await invalid(service.verify(token)))?.reason).toBe('invalid');
    });

    describe('ataques', () => {
      it('un payload alterado (el rol cambiado a ADMIN) con la firma original', async () => {
        const { service } = setup();
        const { token } = await service.issue({ id: USER, role: 'BUYER' });
        const [header, payload, signature] = token.split('.');
        const tampered = Buffer.from(
          JSON.stringify({
            ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
            role: 'ADMIN',
          }),
        ).toString('base64url');
        expect(
          (await invalid(service.verify(`${header}.${tampered}.${signature}`)))
            ?.reason,
        ).toBe('invalid');
      });

      it('una firma alterada', async () => {
        const { service } = setup();
        const { token } = await service.issue({ id: USER, role: 'BUYER' });
        const broken = `${token.slice(0, -4)}${token.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
        expect((await invalid(service.verify(broken)))?.reason).toBe('invalid');
      });

      it('un token firmado con otro secreto', async () => {
        const { service } = setup();
        expect(
          (
            await invalid(
              service.verify(await forge({}, { secret: OTHER_SECRET })),
            )
          )?.reason,
        ).toBe('invalid');
      });

      it('un token sin firma (algoritmo none)', async () => {
        const { service } = setup();
        const header = Buffer.from(
          JSON.stringify({ alg: 'none', typ: 'JWT' }),
        ).toString('base64url');
        const payload = Buffer.from(
          JSON.stringify({
            iss: TOKEN_ISSUER,
            aud: TOKEN_AUDIENCE,
            sub: USER,
            role: 'ADMIN',
            iat: seconds(NOW),
            exp: seconds(NOW) + TTL,
          }),
        ).toString('base64url');
        expect(
          (await invalid(service.verify(`${header}.${payload}.`)))?.reason,
        ).toBe('invalid');
        expect(
          (await invalid(service.verify(`${header}.${payload}`)))?.reason,
        ).toBe('invalid');
      });

      it.each(['HS384', 'HS512'])(
        'un token firmado con %s y el MISMO secreto: solo se acepta HS256',
        async (alg) => {
          const { service } = setup();
          expect(
            (await invalid(service.verify(await forge({}, { alg }))))?.reason,
          ).toBe('invalid');
        },
      );

      it('un token con el emisor equivocado', async () => {
        const { service } = setup();
        expect(
          (
            await invalid(
              service.verify(await forge({}, { iss: 'otro-emisor' })),
            )
          )?.reason,
        ).toBe('invalid');
        expect(
          (await invalid(service.verify(await forge({}, { iss: null }))))
            ?.reason,
        ).toBe('invalid');
      });

      it('un token con la audiencia equivocada', async () => {
        const { service } = setup();
        expect(
          (await invalid(service.verify(await forge({}, { aud: 'otra-api' }))))
            ?.reason,
        ).toBe('invalid');
        expect(
          (await invalid(service.verify(await forge({}, { aud: null }))))
            ?.reason,
        ).toBe('invalid');
      });

      it('un token sin vencimiento', async () => {
        const { service } = setup();
        expect(
          (await invalid(service.verify(await forge({}, { exp: null }))))
            ?.reason,
        ).toBe('invalid');
      });

      it('un token cuya vida es mayor que la configurada, aunque esté firmado bien', async () => {
        const { service } = setup();
        const token = await forge(
          {},
          { exp: new Date(NOW.getTime() + 24 * 3600 * 1000) },
        );
        expect((await invalid(service.verify(token)))?.reason).toBe('invalid');
      });

      it.each([
        ['un rol desconocido', { role: 'SUPERUSER' }],
        ['un rol que no es texto', { role: 1 }],
        ['sin rol', { role: undefined }],
      ])('un token con %s', async (_caso, claims) => {
        const { service } = setup();
        expect(
          (await invalid(service.verify(await forge(claims))))?.reason,
        ).toBe('invalid');
      });

      it.each(['no-es-uuid', '', '0196a000-0000-7000-8000-0000000000aa-x'])(
        'un token cuyo sujeto no es un UUID (%j)',
        async (sub) => {
          const { service } = setup();
          const token = await forge({}, { sub });
          expect((await invalid(service.verify(token)))?.reason).toBe(
            'invalid',
          );
        },
      );

      it('un token sin sujeto', async () => {
        const { service } = setup();
        const token = await forge({}, { sub: null });
        expect((await invalid(service.verify(token)))?.reason).toBe('invalid');
      });

      it('un token con otro tipo en la cabecera, aunque esté firmado bien', async () => {
        const { service } = setup();
        for (const typ of ['at+jwt', 'JWE']) {
          const token = await forge({}, { typ });
          expect((await invalid(service.verify(token)))?.reason).toBe(
            'invalid',
          );
        }
      });

      it('un token que vive un segundo más de lo configurado, aunque esté firmado bien', async () => {
        const { service } = setup();
        const exact = await forge(
          {},
          { exp: new Date(NOW.getTime() + TTL * 1000) },
        );
        await expect(service.verify(exact)).resolves.toBeDefined();
        const over = await forge(
          {},
          { exp: new Date(NOW.getTime() + (TTL + 1) * 1000) },
        );
        expect((await invalid(service.verify(over)))?.reason).toBe('invalid');
      });

      it('un token de más de 4096 caracteres, aunque esté firmado bien; con 4096 todavía se acepta', async () => {
        const { service } = setup();
        const sized = async (target: number) => {
          for (let pad = 2000; pad < 3400; pad += 1) {
            const token = await forge({ relleno: 'x'.repeat(pad) });
            if (token.length === target) return token;
          }
          throw new Error(`No se pudo forjar un token de ${target} caracteres`);
        };
        await expect(service.verify(await sized(4096))).resolves.toBeDefined();
        expect((await invalid(service.verify(await sized(4097))))?.reason).toBe(
          'invalid',
        );
      });

      it.each([
        '',
        ' ',
        'abc',
        'a.b',
        'a.b.c',
        '....',
        'Bearer x.y.z',
        '💥',
        'x'.repeat(5000),
      ])('basura (%j)', async (junk) => {
        const { service } = setup();
        const error = await invalid(service.verify(junk));
        expect(error).toBeInstanceOf(TokenVerificationError);
        expect(error?.reason).toBe('invalid');
      });

      it.each([undefined, null, 42, {}, ['x.y.z']])(
        'lo que no es texto (%j)',
        async (value) => {
          const { service } = setup();
          expect((await invalid(service.verify(value as never)))?.reason).toBe(
            'invalid',
          );
        },
      );

      it('el error no repite el token ni el secreto', async () => {
        const { service } = setup();
        const token = await forge({}, { secret: OTHER_SECRET });
        const error = await invalid(service.verify(token));
        expect(error?.message).not.toContain(token);
        expect(error?.message).not.toContain(SECRET);
        expect(JSON.stringify(error)).not.toContain(OTHER_SECRET);
      });
    });
  });

  describe('configuración', () => {
    it.each(['', 'corto', 'x'.repeat(31)])(
      'rechaza un secreto de menos de 32 caracteres (%j)',
      (secret) => {
        expect(() => new JwtTokenService({ secret, ttlSeconds: TTL })).toThrow(
          /32/,
        );
      },
    );

    it('acepta uno de exactamente 32', () => {
      expect(
        () =>
          new JwtTokenService({
            secret: 'abcdefghijklmnopqrstuvwxyz012345',
            ttlSeconds: TTL,
          }),
      ).not.toThrow();
    });

    it.each([0, -1, 59, 3601, 1.5, Number.NaN])(
      'rechaza una duración de %s segundos',
      (ttlSeconds) => {
        expect(
          () => new JwtTokenService({ secret: SECRET, ttlSeconds }),
        ).toThrow(/duración/i);
      },
    );

    it('un token emitido con un secreto no se verifica con otro servicio de otro secreto', async () => {
      const a = new JwtTokenService({ secret: SECRET, ttlSeconds: TTL });
      const b = new JwtTokenService({ secret: OTHER_SECRET, ttlSeconds: TTL });
      const { token } = await a.issue({ id: USER, role: 'BUYER' });
      expect((await invalid(b.verify(token)))?.reason).toBe('invalid');
    });

    it('sin reloj usa la hora actual', async () => {
      const service = new JwtTokenService({ secret: SECRET, ttlSeconds: TTL });
      const { token } = await service.issue({ id: USER, role: 'BUYER' });
      expect(
        Math.abs(decode(token).payload.iat - Math.floor(Date.now() / 1000)),
      ).toBeLessThanOrEqual(2);
      await expect(service.verify(token)).resolves.toEqual({
        userId: USER,
        role: 'BUYER',
      });
    });
  });
});
