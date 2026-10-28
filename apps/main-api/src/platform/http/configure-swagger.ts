import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { ADMIN_TAG } from './admin-api.decorator.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

// Quita del documento las operaciones de administración: si la API las responde con 404 como si no existieran, la
// documentación tampoco debe mostrarlas
export function hideAdminOperations(document: OpenAPIObject): OpenAPIObject {
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const operation = (item as Record<string, { tags?: string[] }>)[method];
      if (operation?.tags?.includes(ADMIN_TAG)) {
        delete (item as Record<string, unknown>)[method];
      }
    }
    if (!METHODS.some((m) => (item as Record<string, unknown>)[m])) {
      delete document.paths[path];
    }
  }
  return document;
}

// Lo usan main.ts y los tests e2e
export function configureSwagger(app: INestApplication): void {
  const config = app.get(ConfigService);
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
  SwaggerModule.setup('docs', app, () => {
    const document = SwaggerModule.createDocument(app, doc);
    return config.get<boolean>('ADMIN_API_ENABLED') === true
      ? document
      : hideAdminOperations(document);
  });
}
