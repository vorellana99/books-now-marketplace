import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "@/shared/api/errors.ts";

// Un 4xx no mejora reintentando (el libro no existe, la sesión no sirve); una caída de red o un 5xx sí
const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) =>
          failures < MAX_RETRIES && !(isApiError(error) && error.status < 500),
      },
    },
  });
}

export const queryClient = createQueryClient();
