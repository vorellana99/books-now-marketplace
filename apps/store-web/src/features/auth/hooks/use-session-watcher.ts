import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { session } from "../session.ts";

// Cuando la sesión se pierde sin que esta pestaña la cierre (otra pestaña cerró sesión) se vacía la caché y se vuelven a
// evaluar las guardias de la ruta actual: una pantalla con sesión lleva a iniciar sesión, con la ruta de origen
export function useSessionWatcher(): void {
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    let previous = session.getState().status;
    return session.store.subscribe((state) => {
      if (previous === "authenticated" && state.status === "anonymous") {
        queryClient.clear();
        void router.invalidate();
      }
      previous = state.status;
    });
  }, [queryClient, router]);
}
