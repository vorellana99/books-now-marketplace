import { randomUUID } from 'node:crypto';
import { AddStockCommand } from '../../../src/contexts/inventory/application/stock/add-stock.command.js';
import { AddStockHandler } from '../../../src/contexts/inventory/application/stock/add-stock.handler.js';
import { ConfirmReservationCommand } from '../../../src/contexts/inventory/application/stock/confirm-reservation.command.js';
import { ConfirmReservationHandler } from '../../../src/contexts/inventory/application/stock/confirm-reservation.handler.js';
import { CreateStockItemCommand } from '../../../src/contexts/inventory/application/stock/create-stock-item.command.js';
import { CreateStockItemHandler } from '../../../src/contexts/inventory/application/stock/create-stock-item.handler.js';
import { ReleaseStockHandler } from '../../../src/contexts/inventory/application/stock/release-stock.handler.js';
import { ReserveStockHandler } from '../../../src/contexts/inventory/application/stock/reserve-stock.handler.js';
import { MAX_ADDITION } from '../../../src/contexts/inventory/domain/stock/stock-rules.js';
import { ReleaseStockCommand } from '../../../src/contracts/inventory/release-stock.command.js';
import { ReserveStockCommand } from '../../../src/contracts/inventory/reserve-stock.command.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../../src/contracts/inventory/stock.errors.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';
import type { TransactionHandle } from '../../../src/shared-kernel/transaction-handle.js';
import { InMemoryStockRepository } from '../../fakes/in-memory-stock-repository.js';

const A = '9780306406157';
const B = '9780132350884';
const code = async (p: Promise<unknown>) =>
  ((await p.catch((e: unknown) => e)) as DomainError).code;

function setup() {
  const stock = new InMemoryStockRepository();
  return {
    stock,
    reserve: new ReserveStockHandler(stock),
    release: new ReleaseStockHandler(stock),
    add: new AddStockHandler(stock),
    confirm: new ConfirmReservationHandler(stock),
    createItem: new CreateStockItemHandler(stock),
  };
}

describe('ReserveStockHandler', () => {
  it('reserva las líneas con el repositorio', async () => {
    const w = setup();
    w.stock.seed(A, 10);
    const id = randomUUID();

    await w.reserve.execute(
      new ReserveStockCommand(id, [{ isbn: A, quantity: 3 }]),
    );

    expect(w.stock.levelOf(A)).toEqual({ available: 7, reserved: 3 });
    expect(w.stock.reservationsOf(id)).toHaveLength(1);
  });

  describe('una entrada inválida es un error de dominio y no llega al repositorio', () => {
    it.each([
      [
        'un id de pedido que no es UUID',
        'pedido-1',
        [{ isbn: A, quantity: 1 }],
        'INVALID_ORDER_ID',
      ],
      ['sin líneas', randomUUID(), [], 'EMPTY_RESERVATION'],
      [
        'una cantidad de 0',
        randomUUID(),
        [{ isbn: A, quantity: 0 }],
        'INVALID_QUANTITY',
      ],
      [
        'un libro repetido',
        randomUUID(),
        [
          { isbn: A, quantity: 1 },
          { isbn: A, quantity: 1 },
        ],
        'DUPLICATE_RESERVATION_LINE',
      ],
    ])('%s', async (_name, orderId, lines, expected) => {
      const w = setup();
      const reserve = vi.spyOn(w.stock, 'reserve');

      expect(
        await code(w.reserve.execute(new ReserveStockCommand(orderId, lines))),
      ).toBe(expected);
      expect(reserve).not.toHaveBeenCalled();
    });
  });

  it('los errores del repositorio salen con su clase: falta de stock y libro sin registro', async () => {
    const w = setup();
    w.stock.seed(A, 1);

    const out = await w.reserve
      .execute(
        new ReserveStockCommand(randomUUID(), [{ isbn: A, quantity: 2 }]),
      )
      .catch((e: unknown) => e);
    const missing = await w.reserve
      .execute(
        new ReserveStockCommand(randomUUID(), [{ isbn: B, quantity: 1 }]),
      )
      .catch((e: unknown) => e);

    expect(out).toBeInstanceOf(OutOfStockError);
    expect(missing).toBeInstanceOf(StockItemNotFoundError);
  });
});

describe('ReleaseStockHandler', () => {
  it('libera las reservas del pedido', async () => {
    const w = setup();
    w.stock.seed(A, 10);
    const id = randomUUID();
    await w.stock.reserve(id, [{ isbn: A, quantity: 4 }]);

    await w.release.execute(new ReleaseStockCommand(id));

    expect(w.stock.levelOf(A)).toEqual({ available: 10, reserved: 0 });
  });

  it('un id que no es UUID es INVALID_ORDER_ID y no llega al repositorio', async () => {
    const w = setup();
    const release = vi.spyOn(w.stock, 'release');

    expect(await code(w.release.execute(new ReleaseStockCommand('x')))).toBe(
      'INVALID_ORDER_ID',
    );
    expect(release).not.toHaveBeenCalled();
  });

  it('un pedido sin reservas no hace nada', async () => {
    const w = setup();

    await expect(
      w.release.execute(new ReleaseStockCommand(randomUUID())),
    ).resolves.toBeUndefined();
  });
});

describe('AddStockHandler', () => {
  it('suma al stock y devuelve el nivel', async () => {
    const w = setup();
    w.stock.seed(A, 5);

    const level = await w.add.execute(new AddStockCommand(A, 20));

    expect(level).toEqual({ isbn: A, available: 25, reserved: 0 });
  });

  it('acepta el ISBN con guiones y lo normaliza', async () => {
    const w = setup();
    w.stock.seed(A, 5);

    const level = await w.add.execute(
      new AddStockCommand('978-0-306-40615-7', 1),
    );

    expect(level.isbn).toBe(A);
  });

  it('un ISBN mal formado es INVALID_ISBN', async () => {
    const w = setup();

    expect(await code(w.add.execute(new AddStockCommand('123', 1)))).toBe(
      'INVALID_ISBN',
    );
  });

  it.each([0, -1, 1.5, MAX_ADDITION + 1])(
    'una cantidad de %s es INVALID_QUANTITY y no llega al repositorio',
    async (quantity) => {
      const w = setup();
      const add = vi.spyOn(w.stock, 'add');

      expect(await code(w.add.execute(new AddStockCommand(A, quantity)))).toBe(
        'INVALID_QUANTITY',
      );
      expect(add).not.toHaveBeenCalled();
    },
  );

  it('un libro sin registro de stock es StockItemNotFoundError', async () => {
    const w = setup();

    expect(await code(w.add.execute(new AddStockCommand(A, 1)))).toBe(
      'STOCK_ITEM_NOT_FOUND',
    );
  });
});

describe('ConfirmReservationHandler (lo que dispara OrderPlaced)', () => {
  it('confirma las reservas del pedido y le pasa al repositorio la transacción recibida', async () => {
    const w = setup();
    w.stock.seed(A, 10);
    const id = randomUUID();
    await w.stock.reserve(id, [{ isbn: A, quantity: 1 }]);
    const confirm = vi.spyOn(w.stock, 'confirm');
    const tx = { id: 'tx' } as unknown as TransactionHandle;

    await w.confirm.execute(new ConfirmReservationCommand(id, tx));

    expect(confirm).toHaveBeenCalledWith(id, tx);
    expect(w.stock.reservationsOf(id)[0]?.status).toBe('CONFIRMED');
  });

  it('sin transacción también funciona', async () => {
    const w = setup();
    const confirm = vi.spyOn(w.stock, 'confirm');
    const id = randomUUID();

    await w.confirm.execute(new ConfirmReservationCommand(id));

    expect(confirm).toHaveBeenCalledWith(id, undefined);
  });
});

describe('CreateStockItemHandler (lo que dispara catalog.book.created)', () => {
  it('crea el registro de stock en cero con la transacción recibida', async () => {
    const w = setup();
    const createItem = vi.spyOn(w.stock, 'createItem');
    const tx = { id: 'tx' } as unknown as TransactionHandle;

    await w.createItem.execute(new CreateStockItemCommand(B, tx));

    expect(createItem).toHaveBeenCalledWith(B, tx);
    expect(w.stock.levelOf(B)).toEqual({ available: 0, reserved: 0 });
  });

  it('normaliza el ISBN con guiones', async () => {
    const w = setup();

    await w.createItem.execute(new CreateStockItemCommand('978-0-13-235088-4'));

    expect(w.stock.levelOf(B)).toBeDefined();
  });

  it('un ISBN mal formado en el evento es un error (el relay lo reintenta y acaba en FAILED)', async () => {
    const w = setup();

    expect(
      await code(w.createItem.execute(new CreateStockItemCommand('basura'))),
    ).toBe('INVALID_ISBN');
    expect(w.stock.levelOf('basura')).toBeUndefined();
  });

  it('repetirlo no pisa un stock que ya existe', async () => {
    const w = setup();
    w.stock.seed(B, 9, 1);

    await w.createItem.execute(new CreateStockItemCommand(B));

    expect(w.stock.levelOf(B)).toEqual({ available: 9, reserved: 1 });
  });
});
