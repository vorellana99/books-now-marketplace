import { rawApi, unwrap } from "@/shared/api/client.ts";
import type { Credentials } from "@/shared/api/types.ts";

// Las cuatro llamadas de cuenta van por `rawApi`: sin el middleware de sesión, para que la renovación no se llame a sí
// misma ni un `401` de credenciales incorrectas dispare una renovación
export const login = (body: Credentials) => unwrap(rawApi.POST("/auth/login", { body }));

export const register = (body: Credentials) => unwrap(rawApi.POST("/auth/register", { body }));

export const refresh = (refreshToken: string) =>
  unwrap(rawApi.POST("/auth/refresh", { body: { refreshToken } }));

export const logout = (refreshToken: string) =>
  unwrap(rawApi.POST("/auth/logout", { body: { refreshToken } }));
