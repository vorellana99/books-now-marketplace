import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import {
  GetBookPriceQuery,
  type BookPrice,
} from '../../src/contracts/catalog/get-book-price.query.js';
import { ReleaseStockCommand } from '../../src/contracts/inventory/release-stock.command.js';
import { ReserveStockCommand } from '../../src/contracts/inventory/reserve-stock.command.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';
import { insertBook, insertStock, stockOf } from '../support/builders.js';
import { resetDatabase } from '../support/database.js';

// La aplicación completa, con todos los módulos de AppModule: lo que usará Ventas en el corte 5
describe('Catálogo e Inventario en la aplicación completa (por los buses de CQRS)', () => {
  let app: INestApplication;
  let queryBus: QueryBus;
  let commandBus: CommandBus;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    queryBus = app.get(QueryBus);
    commandBus = app.get(CommandBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  it('Catálogo responde a GetBookPriceQuery', async () => {
    const book = await insertBook({ price: '45.00' });

    const result: BookPrice = await queryBus.execute(
      new GetBookPriceQuery(book.isbn),
    );

    expect(result.price).toEqual({ amount: '45.00', currency: 'PEN' });
  });

  it('Inventario responde a ReserveStockCommand y a ReleaseStockCommand', async () => {
    const { isbn } = await insertBook();
    await insertStock(isbn, 10);
    const orderId = randomUUID();

    await commandBus.execute(
      new ReserveStockCommand(orderId, [{ isbn, quantity: 4 }]),
    );
    expect(await stockOf(isbn)).toEqual({ available: 6, reserved: 4 });

    await commandBus.execute(new ReleaseStockCommand(orderId));
    expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
  });

  it('reservar sin stock lanza OutOfStockError y no cambia nada', async () => {
    const { isbn } = await insertBook();
    await insertStock(isbn, 1);

    await expect(
      commandBus.execute(
        new ReserveStockCommand(randomUUID(), [{ isbn, quantity: 2 }]),
      ),
    ).rejects.toBeInstanceOf(OutOfStockError);

    expect(await stockOf(isbn)).toEqual({ available: 1, reserved: 0 });
  });

  it('un libro del catálogo sin registro de stock lanza StockItemNotFoundError', async () => {
    const { isbn } = await insertBook();
    await expect(
      commandBus.execute(
        new ReserveStockCommand(randomUUID(), [{ isbn, quantity: 1 }]),
      ),
    ).rejects.toBeInstanceOf(StockItemNotFoundError);
  });

  it('los errores llegan con la clase del contrato, para que Ventas los atrape por tipo', async () => {
    const error = await queryBus
      .execute(new GetBookPriceQuery('9780306406157'))
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('el endpoint HTTP y la consulta por el bus devuelven lo mismo', async () => {
    const book = await insertBook({ price: '15.00', currency: 'USD' });

    const viaBus = await queryBus.execute(new GetBookPriceQuery(book.isbn));
    const viaHttp = await request(app.getHttpServer())
      .get(`/books/${book.isbn}`)
      .expect(200);

    expect(viaHttp.body).toEqual(viaBus);
  });

  it('Catálogo e Inventario son independientes: se puede valorizar un libro sin stock y reservar uno inactivo', async () => {
    const sinStock = await insertBook();
    const inactivo = await insertBook({ active: false });
    await insertStock(inactivo.isbn, 5);

    expect(
      (await queryBus.execute(new GetBookPriceQuery(sinStock.isbn))).isbn,
    ).toBe(sinStock.isbn);
    // Inventario no consulta el catálogo: reservar no depende de que el libro esté activo
    await commandBus.execute(
      new ReserveStockCommand(randomUUID(), [
        { isbn: inactivo.isbn, quantity: 1 },
      ]),
    );
    expect(await stockOf(inactivo.isbn)).toEqual({ available: 4, reserved: 1 });
  });
});
