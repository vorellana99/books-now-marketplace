import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import { AdminApiEnabledGuard } from './admin-api-enabled.guard.js';

export const ADMIN_TAG = 'admin';

// En la clase de cada controlador de /admin, o en un solo método (como el historial de pedidos, que comparte
// controlador con POST /orders, que debe seguir abierto). Exige el rol ADMIN, la cierra además con
// AdminApiEnabledGuard (hasta que la tarea 7.9 lo elimine) y la etiqueta `admin` en Swagger
export const AdminApi = () =>
  applyDecorators(
    Roles('ADMIN'),
    UseGuards(AdminApiEnabledGuard),
    ApiTags(ADMIN_TAG),
  );
