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

// Ejecuta `create` con variables de entorno temporales. ConfigModule valida y guarda la configuración al
// crearse, así que se pueden restaurar justo después de levantar la aplicación
export async function withEnv<T>(
  env: Record<string, string>,
  create: () => Promise<T>,
): Promise<T> {
  const saved = Object.fromEntries(
    Object.keys(env).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, env);
  try {
    return await create();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
