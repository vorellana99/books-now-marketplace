import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildDatabaseUrl } from '../config/database-url.js';
import { PrismaClient } from './generated/client.js'; // NO desde '@prisma/client'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: buildDatabaseUrl({
          DB_HOST: config.getOrThrow<string>('DB_HOST'),
          DB_PORT: config.getOrThrow<number>('DB_PORT'),
          DB_USER: config.getOrThrow<string>('DB_USER'),
          DB_PASSWORD: config.getOrThrow<string>('DB_PASSWORD'),
          DB_NAME: config.getOrThrow<string>('DB_NAME'),
        }),
        // Las columnas TIMESTAMP no llevan zona horaria. Prisma rellena @default(now()) en UTC desde el cliente y el
        // relay del Outbox compara con now() de la base: si la sesión usara la zona de la base (UTC−5, por ejemplo),
        // las entregas nuevas quedarían programadas horas en el futuro. Todas las conexiones de la app trabajan en UTC
        options: '-c timezone=UTC',
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
