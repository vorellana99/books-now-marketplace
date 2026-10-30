import { Email } from './email.vo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Customer {
  private constructor(
    readonly id: string,
    readonly email: Email,
    readonly isPremium: boolean,
  ) {}

  // Sirve para crear un cliente nuevo y para reconstruirlo desde la BD.
  // Premium solo se lee: aún no hay forma de suscribirse, se marca en la BD
  static create(id: string, email: string, premium = false): Customer {
    return new Customer(id, Email.create(email), premium);
  }

  // Todo comprador registrado es un cliente con el mismo id que su usuario, así no hace falta ninguna tabla que los
  // ligue; un administrador no compra y no lo es (null). Un rol que no se conoce o un id que no es UUID son errores, no se
  // omiten: el relay reintenta y acaba en FAILED, a la vista del monitoreo
  static fromRegisteredUser(user: {
    userId: string;
    email: string;
    role: string;
  }): Customer | null {
    if (user.role === 'ADMIN') return null;
    if (user.role !== 'BUYER') {
      throw new Error(
        `Rol desconocido en identity.user.registered: ${user.role}`,
      );
    }
    if (typeof user.userId !== 'string' || !UUID.test(user.userId)) {
      throw new Error(
        'El id del usuario de identity.user.registered no es un UUID',
      );
    }
    return Customer.create(user.userId, user.email);
  }

  // Repetir el registro no hace daño si el correo es el mismo; con otro, lo que no cuadra es un error
  assertSameEmailAs(other: Customer): void {
    if (this.email.value !== other.email.value) {
      throw new Error(`El cliente ${this.id} ya existe con otro correo`);
    }
  }
}
