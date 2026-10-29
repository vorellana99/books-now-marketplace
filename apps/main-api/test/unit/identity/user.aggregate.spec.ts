import { Email } from '../../../src/contexts/identity/domain/email.vo.js';
import { User } from '../../../src/contexts/identity/domain/user.aggregate.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';

const ID = '0196a000-0000-7000-8000-0000000000aa';
const HASH = 'scrypt$4$8$3$c2FsdA$aGFzaA';
const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};

describe('User', () => {
  const email = Email.create('ana@example.com');

  it('guarda su id, su correo, su hash y su rol', () => {
    const user = User.create({
      id: ID,
      email,
      passwordHash: HASH,
      role: 'BUYER',
    });
    expect(user).toMatchObject({ id: ID, passwordHash: HASH, role: 'BUYER' });
    expect(user.email.value).toBe('ana@example.com');
  });

  it.each(['BUYER', 'ADMIN'] as const)('admite el rol %s', (role) => {
    expect(User.create({ id: ID, email, passwordHash: HASH, role }).role).toBe(
      role,
    );
  });

  it.each(['SUPERUSER', 'buyer', '', null, undefined, 1])(
    'rechaza el rol %j',
    (role) => {
      expect(
        failure(() =>
          User.create({
            id: ID,
            email,
            passwordHash: HASH,
            role: role as never,
          }),
        )?.code,
      ).toBe('INVALID_ROLE');
    },
  );

  it.each(['', '   ', null, undefined])(
    'rechaza un hash vacío (%j): nunca debe existir un usuario sin contraseña',
    (passwordHash) => {
      expect(
        failure(() =>
          User.create({
            id: ID,
            email,
            passwordHash: passwordHash as never,
            role: 'BUYER',
          }),
        )?.code,
      ).toBe('INVALID_USER');
    },
  );

  it.each(['', 'no-es-uuid', 123])(
    'rechaza un id que no es un UUID (%j)',
    (id) => {
      expect(
        failure(() =>
          User.create({
            id: id as never,
            email,
            passwordHash: HASH,
            role: 'BUYER',
          }),
        )?.code,
      ).toBe('INVALID_USER');
    },
  );

  it('ser administrador es un método, no una comparación suelta en cada sitio', () => {
    expect(
      User.create({
        id: ID,
        email,
        passwordHash: HASH,
        role: 'ADMIN',
      }).isAdmin(),
    ).toBe(true);
    expect(
      User.create({
        id: ID,
        email,
        passwordHash: HASH,
        role: 'BUYER',
      }).isAdmin(),
    ).toBe(false);
  });

  it('toJSON no incluye nunca el hash de la contraseña', () => {
    const json = JSON.parse(
      JSON.stringify(
        User.create({ id: ID, email, passwordHash: HASH, role: 'BUYER' }),
      ),
    );
    expect(json).toEqual({ id: ID, email: 'ana@example.com', role: 'BUYER' });
    expect(JSON.stringify(json)).not.toContain('scrypt');
  });
});

describe('User.register (el alta de un comprador)', () => {
  const email = Email.create('ana@example.com');

  it('crea un comprador con el rol BUYER, que no se elige', () => {
    const user = User.register({ id: ID, email, passwordHash: HASH });

    expect(user).toMatchObject({ id: ID, role: 'BUYER', passwordHash: HASH });
  });

  it('deja pendiente un solo evento identity.user.registered, con su id, correo y rol', () => {
    const user = User.register({ id: ID, email, passwordHash: HASH });

    const events = user.pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventName: 'identity.user.registered',
      aggregateId: ID,
      userId: ID,
      email: 'ana@example.com',
      role: 'BUYER',
    });
  });

  it('el evento no lleva la contraseña ni su hash', () => {
    const user = User.register({ id: ID, email, passwordHash: HASH });

    expect(JSON.stringify(user.pullEvents())).not.toContain(HASH);
  });

  it('pullEvents vacía la lista: la segunda vez no hay nada', () => {
    const user = User.register({ id: ID, email, passwordHash: HASH });
    user.pullEvents();

    expect(user.pullEvents()).toEqual([]);
  });

  it('create (un administrador, o un usuario que se carga) no deja eventos', () => {
    const user = User.create({
      id: ID,
      email,
      passwordHash: HASH,
      role: 'ADMIN',
    });

    expect(user.pullEvents()).toEqual([]);
  });

  it('valida igual que create: un id que no es UUID o un hash vacío son errores', () => {
    expect(
      failure(() => User.register({ id: 'x', email, passwordHash: HASH }))
        ?.code,
    ).toBe('INVALID_USER');
    expect(
      failure(() => User.register({ id: ID, email, passwordHash: ' ' }))?.code,
    ).toBe('INVALID_USER');
  });
});
