import { applyDecorators } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';

export const ADMIN_TAG = 'admin';

// En la clase de cada controlador de /admin. Exige el rol ADMIN (sin token 401, con otro rol 403) y etiqueta la ruta
// `admin` en Swagger
export const AdminApi = () =>
  applyDecorators(Roles('ADMIN'), ApiTags(ADMIN_TAG));
