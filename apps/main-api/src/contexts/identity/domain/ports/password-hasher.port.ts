// Convierte una contraseña en un hash que no se puede revertir, y comprueba una contraseña contra un hash guardado.
// El dominio no sabe cómo: la implementación (scrypt) está en infrastructure
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  // Nunca lanza por un hash guardado mal formado: devuelve false
  abstract verify(plain: string, stored: string): Promise<boolean>;
}
