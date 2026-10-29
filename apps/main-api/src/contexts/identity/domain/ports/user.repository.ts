import type { Email } from '../email.vo.js';
import type { User } from '../user.aggregate.js';

// Dónde viven los usuarios
export abstract class UserRepository {
  abstract findByEmail(email: Email): Promise<User | null>;
  abstract findById(id: string): Promise<User | null>;

  // Guarda al usuario y, en la misma transacción, los eventos que dejó pendientes (`pullEvents`): guardados por separado,
  // una caída entre ambos dejaría un comprador sin cliente en Ventas. El índice único del correo decide una carrera:
  // un correo que ya existe es ConflictError EMAIL_ALREADY_REGISTERED y no se guarda nada
  abstract save(user: User): Promise<void>;
}
