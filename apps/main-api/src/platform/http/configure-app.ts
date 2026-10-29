import { INestApplication, ValidationPipe } from '@nestjs/common';
import { requestIdMiddleware } from '../observability/request-id.middleware.js';
import { RequestContextInterceptor } from '../observability/request-context.interceptor.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

// Lo usan main.ts y los tests e2e
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware); // primero: toda respuesta lleva X-Request-Id
  app.useGlobalInterceptors(new RequestContextInterceptor()); // abre el contexto tras el body-parser
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter()); // errores de dominio, de Nest, de Express e inesperados
  app.enableShutdownHooks();
}
