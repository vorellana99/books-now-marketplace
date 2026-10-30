import { redirect } from "@tanstack/react-router";
import { safeReturnTo } from "./return-to.ts";
import { session } from "./session.ts";

// Guardia de las rutas con sesión (`beforeLoad`). Espera a que termine el arranque (recuperar la sesión con el token de
// refresco, si hay) y, sin sesión, lleva a `/ingresar` con la ruta de origen para volver a ella al entrar
export async function requireSession({ location }: { location: { href: string } }): Promise<void> {
  const { status } = await session.ensureSession();
  if (status !== "authenticated") {
    throw redirect({ to: "/ingresar", search: { returnTo: location.href } });
  }
}

// Guardia de `/ingresar` y `/registro`: con la sesión ya iniciada no tienen nada que mostrar. Va a `returnTo` si es una
// ruta interna, o al catálogo
export async function redirectIfSignedIn({
  search,
}: {
  search: { returnTo?: string | undefined };
}): Promise<void> {
  const { status } = await session.ensureSession();
  if (status === "authenticated") {
    throw redirect({ href: safeReturnTo(search.returnTo) ?? "/" });
  }
}
