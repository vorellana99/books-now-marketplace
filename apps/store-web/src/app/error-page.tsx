import { isApiError } from "@/shared/api/errors.ts";
import { ErrorState } from "@/shared/ui/state-panel.tsx";

// PA-10: error inesperado. Ninguna falla deja la pantalla en blanco; si el error vino de la API, muestra su
// código de soporte (el `X-Request-Id`), que se puede buscar en los logs del backend
export function ErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <>
      <title>Algo salió mal · LibroYa</title>
      <ErrorState
        as="h1"
        onRetry={reset}
        supportCode={isApiError(error) ? error.requestId : undefined}
      />
    </>
  );
}
