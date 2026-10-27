import { Email } from './email.vo.js';

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
}
