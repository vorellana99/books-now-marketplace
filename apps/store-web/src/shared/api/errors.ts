// Cuerpo de un error de negocio de la API (DomainExceptionFilter). El contrato OpenAPI aún no lo describe
export type ApiErrorBody = {
  statusCode?: number;
  errorCode?: string;
  message?: string;
};

type ApiErrorInit = {
  status: number;
  errorCode?: string | undefined;
  message?: string | undefined;
  requestId?: string | undefined;
};

// Una respuesta no exitosa de la API. El mensaje que se muestra a la persona sale de `errorCode`,
// nunca de `message`, que está pensado para desarrolladores
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | undefined;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message ?? `La API respondió ${init.status}`);
    this.name = "ApiError";
    this.status = init.status;
    this.errorCode = init.errorCode;
    this.requestId = init.requestId;
  }
}

// No hubo respuesta: red caída, tiempo agotado o la API no contestó. No se sabe qué pasó en el servidor
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("No hubo respuesta de la API", { cause });
    this.name = "NetworkError";
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
export const isNetworkError = (error: unknown): error is NetworkError =>
  error instanceof NetworkError;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Convierte una respuesta no exitosa en un ApiError. Función suelta: no depende del cliente HTTP
export function toApiError(response: Response, body?: unknown): ApiError {
  const parsed = isObject(body) ? body : {};
  return new ApiError({
    status: response.status,
    errorCode: typeof parsed.errorCode === "string" ? parsed.errorCode : undefined,
    message: typeof parsed.message === "string" ? parsed.message : undefined,
    requestId: response.headers.get("X-Request-Id") ?? undefined,
  });
}
