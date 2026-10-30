import { applyDecorators } from '@nestjs/common';
import { ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

// Lo que documenta Swagger de una ruta con sesión: el 401 (falta o vence el token) y, si la ruta exige un rol, el 403.
// `forbidden` es el texto del 403 («FORBIDDEN: solo los administradores»); sin él no se documenta ninguno
export const ApiAuthErrors = (forbidden?: string) =>
  applyDecorators(
    ApiUnauthorizedResponse({
      description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
    }),
    ...(forbidden === undefined
      ? []
      : [ApiForbiddenResponse({ description: forbidden })]),
  );
