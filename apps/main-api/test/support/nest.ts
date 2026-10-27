import type { INestApplication, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { envSchema } from '../../src/platform/config/env.schema.js';
import { PrismaModule } from '../../src/platform/prisma/prisma.module.js';

// Una aplicación mínima con la base de pruebas real, el bus de CQRS y solo los módulos indicados.
// Para probar un contexto sin arrancar los demás
export async function createTestApp(
  ...modules: Type[]
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validate: (env) => envSchema.parse(env),
      }),
      CqrsModule.forRoot(),
      PrismaModule,
      ...modules,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
