import type { INestApplication } from '@nestjs/common';
import { configureApp } from './configure-app.js';
import { configureSecurity } from './configure-security.js';
import { configureSwagger } from './configure-swagger.js';

// Toda la configuración HTTP de la aplicación, en su orden: pipes y filtros, seguridad (helmet y CORS) y Swagger. La usan
// `main.ts` y las pruebas e2e que montan la aplicación completa, para que lo que se prueba sea lo que corre en producción
export function configureHttpApp(app: INestApplication): void {
  configureApp(app);
  configureSecurity(app);
  configureSwagger(app);
}
