import {
  type DynamicModule,
  type ForwardReference,
  Module,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';

type Importable =
  NonNullable<DynamicModule['imports']>[number] | ForwardReference;

export interface AuthModuleOptions {
  // El módulo que provee y exporta `AccessTokenVerifier` (hoy, Identidad). La plataforma no lo conoce: se lo dice quien
  // arma la aplicación
  verifier: Importable;
}

// Denegado por defecto: registra el guard global que exige un token de acceso válido en toda ruta que no sea @Public.
// Exige que `verifier` provea `AccessTokenVerifier`; si no lo hace, Nest no puede construir el guard y la aplicación
// NO arranca, así que la API nunca queda abierta por olvido. Va en `AppModule`, no dentro de un contexto, y las pruebas
// que montan módulos sueltos lo importan igual
@Module({})
export class AuthModule {
  static register({ verifier }: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      imports: [verifier],
      providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
    };
  }
}
