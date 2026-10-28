import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminApiEnabledGuard } from './admin-api-enabled.guard.js';

export const ADMIN_TAG = 'admin';

// En la clase de cada controlador de /admin, o en un solo método (como el historial de pedidos, que comparte
// controlador con POST /orders, que debe seguir abierto). Cierra la ruta con AdminApiEnabledGuard y la etiqueta
// `admin` en Swagger
export const AdminApi = () =>
  applyDecorators(UseGuards(AdminApiEnabledGuard), ApiTags(ADMIN_TAG));
