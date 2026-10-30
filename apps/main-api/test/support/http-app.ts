import type { DynamicModule, INestApplication, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { envSchema } from '../../src/platform/config/env.schema.js';
import { configureHttpApp } from '../../src/platform/http/configure-http-app.js';
import { PrismaModule } from '../../src/platform/prisma/prisma.module.js';
import { withEnv } from './nest.js';

// Una aplicación HTTP con la base de pruebas real, los módulos indicados y la misma configuración que main.ts, con las
// variables de entorno que haga falta (por ejemplo los límites de intentos). AppModule valida el entorno al importarse, así
// que para cambiarlo se arman los módulos aquí, con una validación nueva
export async function createHttpApp(
  modules: (Type | DynamicModule)[],
  env: Record<string, string> = {},
): Promise<INestApplication> {
  const moduleRef = await withEnv(env, () =>
    Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (e) => envSchema.parse(e),
        }),
        CqrsModule.forRoot(),
        PrismaModule,
        ...modules,
      ],
    }).compile(),
  );
  const app = moduleRef.createNestApplication();
  configureHttpApp(app);
  await app.init();
  return app;
}
