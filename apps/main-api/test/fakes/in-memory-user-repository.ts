import { UserRepository } from '../../src/contexts/identity/domain/ports/user.repository.js';
import type { Email } from '../../src/contexts/identity/domain/email.vo.js';
import { User } from '../../src/contexts/identity/domain/user.aggregate.js';
import type { Role } from '../../src/shared-kernel/role.js';
import { ConflictError } from '../../src/shared-kernel/domain.errors.js';

export interface PublishedEvent {
  eventName: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// Usuarios en memoria. Un correo no se repite, como el índice único de la base
export class InMemoryUserRepository extends UserRepository {
  private readonly users = new Map<string, User>();
  private readonly events: PublishedEvent[] = [];

  findByEmail(email: Email): Promise<User | null> {
    const found = [...this.users.values()].find(
      (u) => u.email.value === email.value,
    );
    return Promise.resolve(found ?? null);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  save(user: User): Promise<void> {
    const taken = [...this.users.values()].some(
      (u) => u.email.value === user.email.value,
    );
    if (taken) {
      return Promise.reject(
        new ConflictError(
          'EMAIL_ALREADY_REGISTERED',
          'Ya existe una cuenta con ese correo',
        ),
      );
    }
    for (const event of user.pullEvents()) {
      this.events.push({
        eventName: event.eventName,
        aggregateId: event.aggregateId,
        payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
      });
    }
    this.users.set(user.id, user);
    return Promise.resolve();
  }

  // Ayudas para las pruebas
  published(): PublishedEvent[] {
    return [...this.events];
  }

  // Cambia el rol de un usuario ya guardado, como haría un administrador de la base
  setRole(id: string, role: Role): void {
    const user = this.users.get(id);
    if (!user) throw new Error(`no hay un usuario ${id}`);
    this.users.set(
      id,
      User.create({
        id,
        email: user.email,
        passwordHash: user.passwordHash,
        role,
      }),
    );
  }

  count(): number {
    return this.users.size;
  }
}
