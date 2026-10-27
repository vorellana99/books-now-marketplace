import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './platform/http/configure-app.js';
import { RequestAwareLogger } from './platform/observability/request-aware.logger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new RequestAwareLogger({ json: true }),
  });
  configureApp(app);

  const doc = new DocumentBuilder()
    .setTitle('LibroYa API')
    .setVersion('1.0')
    .addGlobalParameters({
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      description: 'Opcional; si falta, la API genera uno',
    })
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, doc),
  );

  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

await bootstrap();
