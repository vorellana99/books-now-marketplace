import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { connectionOptions } from '../config/connection-options.js';
import { buildDatabaseUrl } from '../config/database-url.js';
import { PrismaClient } from './generated/client.js'; // NO desde '@prisma/client'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
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
        options: connectionOptions(
          config.getOrThrow<number>('DB_STATEMENT_TIMEOUT_MS'),
        ),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Se desconecta en la fase de apagado (después de beforeApplicationShutdown) y no al destruir los módulos:
  // así el relay del Outbox puede terminar la entrega en curso antes de que se cierre la conexión
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
