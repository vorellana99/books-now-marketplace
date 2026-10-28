import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

// Abre una ruta (o todas las de un controlador) a quien no ha iniciado sesión. Sin esto, toda ruta exige un token:
// una ruta nueva nunca queda abierta por olvido. Si la misma ruta lleva también @Roles, manda @Roles
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
