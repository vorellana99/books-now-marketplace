import { randomUUID } from 'node:crypto';
import { Email } from '../../src/contexts/identity/domain/email.vo.js';
import type { UserRepository } from '../../src/contexts/identity/domain/ports/user.repository.js';
import { User } from '../../src/contexts/identity/domain/user.aggregate.js';
import { ConflictError } from '../../src/shared-kernel/domain.errors.js';

export interface PublishedEvent {
  eventName: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// Lo que cada implementación aporta además del puerto, para mirar lo que se publicó sin pasar por él
export interface UserRepositorySubject {
  repo: UserRepository;
  published(): Promise<PublishedEvent[]>; // los eventos que dejó guardar, en el Outbox o en memoria
  count(): Promise<number>; // cuántos usuarios hay guardados
}

const HASH = 'scrypt$4$8$3$c2FsdA$aGFzaA';

// La misma batería para el fake en memoria y para el adaptador de Prisma
export function userRepositoryContract(
  name: string,
  create: () => Promise<UserRepositorySubject>,
): void {
  describe(`UserRepository: contrato (${name})`, () => {
    const buyer = (email = 'ana@example.com') =>
      User.register({
        id: randomUUID(),
        email: Email.create(email),
        passwordHash: HASH,
      });
    const admin = (email = 'root@example.com') =>
      User.create({
        id: randomUUID(),
        email: Email.create(email),
        passwordHash: HASH,
        role: 'ADMIN',
      });

    describe('save, findByEmail y findById', () => {
      it('guarda un usuario y se encuentra por su correo y por su id, con todos sus datos', async () => {
        const s = await create();
        const user = buyer();

        await s.repo.save(user);

        for (const found of [
          await s.repo.findByEmail(user.email),
          await s.repo.findById(user.id),
        ]) {
          expect(found).not.toBeNull();
          expect(found?.id).toBe(user.id);
          expect(found?.email.value).toBe('ana@example.com');
          expect(found?.passwordHash).toBe(HASH);
          expect(found?.role).toBe('BUYER');
        }
      });

      it('un usuario que no existe es null, por correo y por id', async () => {
        const s = await create();

        expect(
          await s.repo.findByEmail(Email.create('nadie@example.com')),
        ).toBeNull();
        expect(await s.repo.findById(randomUUID())).toBeNull();
      });

      it('guarda también a un administrador', async () => {
        const s = await create();
        const user = admin();

        await s.repo.save(user);

        expect((await s.repo.findById(user.id))?.role).toBe('ADMIN');
      });

      it('lo que se encuentra no trae eventos pendientes', async () => {
        const s = await create();
        const user = buyer();
        await s.repo.save(user);

        const found = await s.repo.findById(user.id);

        expect(found?.pullEvents()).toEqual([]);
      });
    });

    describe('un correo repetido', () => {
      it('da ConflictError EMAIL_ALREADY_REGISTERED y no guarda un segundo usuario ni su evento', async () => {
        const s = await create();
        await s.repo.save(buyer());

        const error = await s.repo.save(buyer()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(await s.count()).toBe(1);
        expect(await s.published()).toHaveLength(1);
      });

      it('también contra un administrador: un correo es de una sola cuenta', async () => {
        const s = await create();
        await s.repo.save(admin('mismo@example.com'));

        const error = await s.repo
          .save(buyer('mismo@example.com'))
          .catch((e: unknown) => e);

        expect((error as ConflictError).code).toBe('EMAIL_ALREADY_REGISTERED');
      });

      it('dos altas simultáneas con el mismo correo: una entra y la otra recibe el conflicto', async () => {
        const s = await create();

        const results = await Promise.allSettled([
          s.repo.save(buyer('carrera@example.com')),
          s.repo.save(buyer('carrera@example.com')),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((r) => r.status === 'rejected');
        expect(
          ((rejected as PromiseRejectedResult).reason as ConflictError).code,
        ).toBe('EMAIL_ALREADY_REGISTERED');
        expect(await s.count()).toBe(1);
      });
    });

    describe('el evento del alta', () => {
      it('registrar a un comprador publica identity.user.registered con su id, correo y rol, junto con el usuario', async () => {
        const s = await create();
        const user = buyer();

        await s.repo.save(user);

        const events = await s.published();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          eventName: 'identity.user.registered',
          aggregateId: user.id,
        });
        expect(events[0]?.payload).toMatchObject({
          userId: user.id,
          email: 'ana@example.com',
          role: 'BUYER',
        });
      });

      it('el evento no lleva la contraseña ni su hash', async () => {
        const s = await create();
        await s.repo.save(buyer());

        expect(JSON.stringify(await s.published())).not.toContain(HASH);
      });

      it('un administrador no publica nada: no es un cliente de Ventas', async () => {
        const s = await create();

        await s.repo.save(admin());

        expect(await s.published()).toEqual([]);
        expect(await s.count()).toBe(1);
      });

      it('guardar dos veces el mismo usuario no publica dos veces el evento', async () => {
        const s = await create();
        const user = buyer();
        await s.repo.save(user);

        await s.repo.save(user).catch(() => undefined); // el segundo choca con el correo

        expect(await s.published()).toHaveLength(1);
      });
    });
  });
}
