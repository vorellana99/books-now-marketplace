import { randomUUID } from 'node:crypto';
import type { OrderHistory } from '../../src/contexts/sales/domain/ports/order-history.js';
import type { SeedOrder } from '../fakes/in-memory-order-history.js';

// Lo que cada implementación aporta además del puerto: preparar un pedido ya hecho, sin pasar por el dominio
export interface OrderHistorySubject {
  history: OrderHistory;
  seed(order: Partial<SeedOrder> & { customerId: string }): Promise<SeedOrder>;
}

const ADDRESS = {
  recipient: 'Ana Pérez',
  phone: '987654321',
  line1: 'Av. Siempre Viva 123',
  district: 'Miraflores',
  province: 'Lima',
  department: 'Lima',
  reference: null,
};
const at = (iso: string) => new Date(iso);

// La misma batería para el fake en memoria y para el adaptador de Prisma: así el fake con el que se prueban los casos de
// uso no se desvía de lo real. Cada test pide un sujeto nuevo
export function orderHistoryContract(
  name: string,
  create: () => Promise<OrderHistorySubject>,
): void {
  describe(`OrderHistory (${name})`, () => {
    let s: OrderHistorySubject;
    let ana: string;
    let luis: string;
    beforeEach(async () => {
      s = await create();
      ana = randomUUID();
      luis = randomUUID();
    });

    const buyer = (userId: string) => ({ userId, role: 'BUYER' as const });
    const admin = () => ({ userId: randomUUID(), role: 'ADMIN' as const });

    describe('findVisible', () => {
      it('devuelve el pedido a su dueño, con montos de 2 decimales y las líneas por ISBN', async () => {
        const order = await s.seed({
          customerId: ana,
          charged: '120.00',
          lines: [
            {
              isbn: '9780321125217',
              title: 'DDD',
              unitPrice: '75.500000',
              quantity: 1,
            },
            {
              isbn: '9780132350884',
              title: 'Clean Code',
              unitPrice: '45.000000',
              quantity: 1,
            },
          ],
        });

        expect(await s.history.findVisible(order.id, buyer(ana))).toEqual({
          id: order.id,
          status: 'PLACED',
          charged: { amount: '120.00', currency: 'PEN' },
          lines: [
            {
              isbn: '9780132350884',
              title: 'Clean Code',
              unitPrice: { amount: '45.00', currency: 'PEN' },
              quantity: 1,
            },
            {
              isbn: '9780321125217',
              title: 'DDD',
              unitPrice: { amount: '75.50', currency: 'PEN' },
              quantity: 1,
            },
          ],
          shippingAddress: null,
        });
      });

      it('un pedido en dólares se muestra en dólares, el cobro y cada línea', async () => {
        const order = await s.seed({ customerId: ana, currency: 'USD' });
        const view = await s.history.findVisible(order.id, buyer(ana));
        expect(view?.charged.currency).toBe('USD');
        expect(view?.lines.map((l) => l.unitPrice.currency)).toEqual(['USD']);
      });

      it('lleva la dirección de envío, con la referencia o sin ella', async () => {
        const without = await s.seed({ customerId: ana, shipping: ADDRESS });
        const withRef = await s.seed({
          customerId: ana,
          shipping: { ...ADDRESS, reference: 'Frente al parque' },
        });

        expect(
          (await s.history.findVisible(without.id, buyer(ana)))
            ?.shippingAddress,
        ).toEqual(ADDRESS);
        expect(
          (await s.history.findVisible(withRef.id, buyer(ana)))?.shippingAddress
            ?.reference,
        ).toBe('Frente al parque');
      });

      it('un comprador no ve el pedido de otro: el mismo resultado que uno que no existe', async () => {
        const order = await s.seed({ customerId: ana });

        expect(await s.history.findVisible(order.id, buyer(luis))).toBeNull();
        expect(
          await s.history.findVisible(randomUUID(), buyer(ana)),
        ).toBeNull();
      });

      it('un administrador ve el pedido de cualquiera', async () => {
        const order = await s.seed({ customerId: ana });

        expect((await s.history.findVisible(order.id, admin()))?.id).toBe(
          order.id,
        );
      });

      it('un administrador tampoco ve un pedido que no existe', async () => {
        expect(await s.history.findVisible(randomUUID(), admin())).toBeNull();
      });

      it('las líneas de un pedido no se mezclan con las de otro', async () => {
        const a = await s.seed({
          customerId: ana,
          lines: [
            { isbn: '9780132350884', title: 'A', unitPrice: '1', quantity: 1 },
          ],
        });
        await s.seed({
          customerId: ana,
          lines: [
            { isbn: '9780321125217', title: 'B', unitPrice: '2', quantity: 3 },
          ],
        });

        const view = await s.history.findVisible(a.id, buyer(ana));
        expect(view?.lines.map((l) => l.title)).toEqual(['A']);
      });
    });

    describe('listByCustomer', () => {
      it('solo los pedidos del cliente; uno sin pedidos o que no existe recibe una lista vacía', async () => {
        const mine = await s.seed({ customerId: ana });
        await s.seed({ customerId: luis });

        const page = await s.history.listByCustomer(ana, 10);

        expect(page.items.map((i) => i.id)).toEqual([mine.id]);
        expect(await s.history.listByCustomer(randomUUID(), 10)).toEqual({
          items: [],
          next: null,
        });
      });

      it('del más reciente al más antiguo, y a igual instante por id descendente', async () => {
        const old = await s.seed({
          customerId: ana,
          createdAt: at('2026-01-01T10:00:00.000Z'),
        });
        const recent = await s.seed({
          customerId: ana,
          createdAt: at('2026-03-01T10:00:00.000Z'),
        });
        const [a, b] = [
          await s.seed({
            customerId: ana,
            id: '0196a000-0000-7000-8000-000000000001',
            createdAt: at('2026-02-01T10:00:00.000Z'),
          }),
          await s.seed({
            customerId: ana,
            id: '0196a000-0000-7000-8000-000000000002',
            createdAt: at('2026-02-01T10:00:00.000Z'),
          }),
        ];

        const page = await s.history.listByCustomer(ana, 10);

        expect(page.items.map((i) => i.id)).toEqual([
          recent.id,
          b.id,
          a.id,
          old.id,
        ]);
      });

      it('cada pedido lleva su fecha en ISO, el detalle y la dirección', async () => {
        const order = await s.seed({
          customerId: ana,
          createdAt: at('2026-05-06T07:08:09.123Z'),
          shipping: ADDRESS,
        });

        const [item] = (await s.history.listByCustomer(ana, 10)).items;

        expect(item).toMatchObject({
          id: order.id,
          status: 'PLACED',
          createdAt: '2026-05-06T07:08:09.123Z',
          charged: { amount: '90.00', currency: 'PEN' },
          shippingAddress: ADDRESS,
        });
      });

      it('con más pedidos que el límite devuelve el límite y la posición del último; la última página no tiene siguiente', async () => {
        for (const day of ['01', '02', '03']) {
          await s.seed({
            customerId: ana,
            createdAt: at(`2026-04-${day}T10:00:00.000Z`),
          });
        }

        const first = await s.history.listByCustomer(ana, 2);

        expect(first.items).toHaveLength(2);
        expect(first.next).toEqual({
          createdAt: at('2026-04-02T10:00:00.000Z'),
          id: first.items[1].id,
        });
        const second = await s.history.listByCustomer(
          ana,
          2,
          first.next ?? undefined,
        );
        expect(second.items).toHaveLength(1);
        expect(second.next).toBeNull();
      });

      it('si el total es múltiplo del límite no hay una página final vacía', async () => {
        for (const day of ['01', '02']) {
          await s.seed({
            customerId: ana,
            createdAt: at(`2026-04-${day}T10:00:00.000Z`),
          });
        }

        const page = await s.history.listByCustomer(ana, 2);

        expect(page.items).toHaveLength(2);
        expect(page.next).toBeNull();
      });

      it('recorrer las páginas da cada pedido una vez, también con el mismo instante', async () => {
        const same = at('2026-04-01T10:00:00.000Z');
        const ids = new Set<string>();
        for (let i = 0; i < 5; i++) {
          ids.add((await s.seed({ customerId: ana, createdAt: same })).id);
        }

        const seen: string[] = [];
        let after: Awaited<ReturnType<OrderHistory['listByCustomer']>>['next'] =
          null;
        do {
          const page = await s.history.listByCustomer(
            ana,
            2,
            after ?? undefined,
          );
          seen.push(...page.items.map((i) => i.id));
          after = page.next;
        } while (after);

        expect(seen).toHaveLength(5);
        expect(new Set(seen)).toEqual(ids);
      });

      it('la posición sigue valiendo aunque su pedido ya no exista, y no filtra pedidos de otro cliente', async () => {
        const mine = await s.seed({
          customerId: ana,
          createdAt: at('2026-01-01T10:00:00.000Z'),
        });
        const theirs = await s.seed({
          customerId: luis,
          createdAt: at('2026-06-01T10:00:00.000Z'),
        });

        const page = await s.history.listByCustomer(ana, 10, {
          createdAt: at('2026-06-01T10:00:00.000Z'),
          id: theirs.id,
        });
        const ghost = await s.history.listByCustomer(ana, 10, {
          createdAt: at('2026-12-31T10:00:00.000Z'),
          id: randomUUID(),
        });

        expect(page.items.map((i) => i.id)).toEqual([mine.id]);
        expect(ghost.items.map((i) => i.id)).toEqual([mine.id]);
      });
    });
  });
}
