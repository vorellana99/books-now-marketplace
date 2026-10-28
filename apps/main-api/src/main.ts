import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { configureApp } from './platform/http/configure-app.js';
import { configureSwagger } from './platform/http/configure-swagger.js';
import { formatStartupBanner } from './platform/observability/startup-banner.js';
import { RequestAwareLogger } from './platform/observability/request-aware.logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // JSON en producción (lo leen herramientas); en desarrollo, texto con colores
    logger: new RequestAwareLogger({
      json: process.env.NODE_ENV === 'production',
    }),
  });
  configureApp(app);

  configureSwagger(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);

  const info = {
    baseUrl: `http://localhost:${port}`,
    environment: config.getOrThrow<string>('NODE_ENV'),
    database: `${config.getOrThrow<string>('DB_HOST')}:${config.getOrThrow<number>('DB_PORT')}/${config.getOrThrow<string>('DB_NAME')}`,
    paymentProvider: config.getOrThrow<string>('PAYMENT_PROVIDER'),
    adminApi: config.getOrThrow<boolean>('ADMIN_API_ENABLED'),
  };
  if (info.environment === 'production') {
    new Logger('Bootstrap').log({ message: 'LibroYa API lista', ...info });
  } else {
    console.log(formatStartupBanner(info)); // legible para personas; producción mantiene el log JSON
  }
}

await bootstrap();
