import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { session } from "../session.ts";

// Cerrar sesión (HU-04): lleva al catálogo como visitante, borra los dos tokens aunque la API falle y vacía la caché de
// consultas, para que la siguiente persona del equipo no vea datos ajenos. El carrito guardado no se toca (DP-04).
// Se navega ANTES de cerrar: si no, una pantalla con sesión mandaría a iniciar sesión en vez de al catálogo
export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    await router.navigate({ to: "/" });
    await session.signOut();
    queryClient.clear();
  };
}
