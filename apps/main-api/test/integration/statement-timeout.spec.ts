import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { createTestApp, withEnv } from '../support/nest.js';

describe('Conexión de la aplicación (PostgreSQL real)', () => {
  describe('con la configuración por defecto', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
      app = await createTestApp();
      prisma = app.get(PrismaService);
    });
    afterAll(async () => {
      await app.close();
    });

    it('cada sentencia tiene un límite de 5 segundos', async () => {
      const [row] = await prisma.$queryRaw<
        { statement_timeout: string }[]
      >`SHOW statement_timeout`;
      expect(row.statement_timeout).toBe('5s');
    });

    it('la zona horaria sigue siendo UTC', async () => {
      const [row] = await prisma.$queryRaw<
        { TimeZone: string }[]
      >`SHOW timezone`;
      expect(row.TimeZone).toBe('UTC');
    });

    it('lo normal sigue funcionando', async () => {
      const [row] = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
      expect(row.ok).toBe(1);
    });
  });

  describe('con DB_STATEMENT_TIMEOUT_MS=300', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
      app = await withEnv({ DB_STATEMENT_TIMEOUT_MS: '300' }, () =>
        createTestApp(),
      );
      prisma = app.get(PrismaService);
    });
    afterAll(async () => {
      await app.close();
    });

    it('una sentencia lenta se cancela por tiempo, sin esperar a que termine', async () => {
      const started = Date.now();

      const error = await prisma.$queryRaw`SELECT pg_sleep(3)`.catch(
        (e: unknown) => e,
      );

      expect(String(error)).toMatch(/statement timeout|57014/i);
      expect(Date.now() - started).toBeLessThan(2000);
    });

    it('también dentro de una transacción, que se deshace', async () => {
      const error = await prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE sales.customers SET premium = premium WHERE false`;
          await tx.$queryRaw`SELECT pg_sleep(3)`;
        })
        .catch((e: unknown) => e);

      expect(String(error)).toMatch(/statement timeout|57014|transaction/i);
    });

    it('una sentencia rápida no se ve afectada', async () => {
      const [row] = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;
      expect(row.ok).toBe(1);
    });
  });
});
