// El filtro HTTP decide el código según la clase
export class DomainError extends Error {
  // → 422
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// → 404
export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} ${id} no existe`);
  }
}

// → 409
export class ConflictError extends DomainError {}

// → 401. Quien llama no se pudo identificar. Su mensaje es siempre genérico: no revela cuál de las credenciales falló
export class AuthenticationError extends DomainError {}

// → 403. Se sabe quién llama, pero no puede hacer esto
export class AuthorizationError extends DomainError {}

// → 429. Demasiados intentos seguidos
export class TooManyRequestsError extends DomainError {}
