import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Lo usan main.ts y los tests e2e
export function configureSwagger(app: INestApplication): void {
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
}
