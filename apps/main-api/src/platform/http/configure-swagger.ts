import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { routeAccess } from '../auth/route-access.js';

const BEARER = 'bearer';

type Operation = {
  security?: Record<string, string[]>[];
  responses: Record<
    string,
    { description?: string; content?: Record<string, unknown> }
  >;
};

const errorBody = {
  'application/json': {
    schema: { $ref: '#/components/schemas/ErrorResponse' },
  },
};

// Marca en el documento qué rutas piden sesión: las públicas con `security: []` y el resto con el esquema Bearer, y a las
// protegidas les asegura las respuestas 401 (y 403 si exigen un rol) con el cuerpo de error de la API. Sale de los mismos
// decoradores que usa el guard, así que la documentación no puede discrepar de lo que la API hace
export function describeAccess(
  document: OpenAPIObject,
  app: INestApplication,
): OpenAPIObject {
  const reflector = app.get(Reflector);
  const operations = new Map<string, Operation>();
  for (const item of Object.values(document.paths)) {
    for (const operation of Object.values(item) as (Operation & {
      operationId?: string;
    })[]) {
      if (operation?.operationId) {
        operations.set(operation.operationId, operation);
      }
    }
  }

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name] as (
          ...args: never[]
        ) => unknown;
        if (
          (Reflect.getMetadata(METHOD_METADATA, handler) as
            RequestMethod | undefined) === undefined
        ) {
          continue;
        }
        const operation = operations.get(`${controller.name}_${name}`);
        if (!operation) continue;
        const { isPublic, roles } = routeAccess(reflector, handler, controller);
        if (isPublic) {
          operation.security = [];
          continue;
        }
        operation.security = [{ [BEARER]: [] }];
        operation.responses['401'] = {
          description:
            'UNAUTHENTICATED (falta o no vale el token) o TOKEN_EXPIRED (venció: renueve la sesión)',
          ...operation.responses['401'],
          content: errorBody,
        };
        if (roles) {
          operation.responses['403'] = {
            description: `FORBIDDEN: se necesita el rol ${roles.join(' o ')}`,
            ...operation.responses['403'],
            content: errorBody,
          };
        }
      }
    }
  }

  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ErrorResponse: {
      type: 'object',
      required: ['statusCode', 'errorCode', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 401 },
        errorCode: { type: 'string', example: 'UNAUTHENTICATED' },
        message: { type: 'string' },
      },
    },
  };
  return document;
}

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
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'El `accessToken` de `POST /auth/login` (o de `/auth/refresh`). Pulse «Authorize» y péguelo sin la palabra Bearer',
      },
      BEARER,
    )
    .build();
  SwaggerModule.setup('docs', app, () =>
    describeAccess(SwaggerModule.createDocument(app, doc), app),
  );
}
