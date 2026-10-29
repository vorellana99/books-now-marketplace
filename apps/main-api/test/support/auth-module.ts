import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AuthModule } from '../../src/platform/auth/auth.module.js';

// El guard global de autenticación (denegado por defecto), como lo arma `AppModule`. Las pruebas que montan módulos
// sueltos y quieren rutas con sesión lo añaden junto a IdentityModule: ya no lo registra Identidad
export const AUTH_MODULE = AuthModule.register({ verifier: IdentityModule });
