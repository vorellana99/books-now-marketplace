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
