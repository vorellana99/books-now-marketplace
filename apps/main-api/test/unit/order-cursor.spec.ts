import { OrderCursor } from '../../src/contexts/sales/infrastructure/order/order-cursor.js';

const ID = '0196a000-0000-7000-8000-0000000000aa';
const AT = new Date('2026-10-28T12:34:56.789Z');

describe('OrderCursor: el cursor opaco del historial de pedidos', () => {
  it('ida y vuelta: lo que se codifica se decodifica igual', () => {
    const decoded = OrderCursor.decode(
      OrderCursor.encode({ createdAt: AT, id: ID }),
    );
    expect(decoded).toEqual({ createdAt: AT, id: ID });
  });

  it('conserva los milisegundos', () => {
    const at = new Date('2026-01-02T03:04:05.006Z');
    expect(
      OrderCursor.decode(
        OrderCursor.encode({ createdAt: at, id: ID }),
      )?.createdAt.getTime(),
    ).toBe(at.getTime());
  });

  it('es texto seguro para una URL: sin +, / ni =', () => {
    for (let i = 0; i < 50; i++) {
      const cursor = OrderCursor.encode({
        createdAt: new Date(AT.getTime() + i * 987654321),
        id: `${ID.slice(0, -2)}${String(i).padStart(2, '0')}`,
      });
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('no deja ver el id ni la fecha a simple vista', () => {
    const cursor = OrderCursor.encode({ createdAt: AT, id: ID });
    expect(cursor).not.toContain(ID);
    expect(cursor).not.toContain('2026');
  });

  it('dos pedidos distintos dan cursores distintos', () => {
    expect(OrderCursor.encode({ createdAt: AT, id: ID })).not.toBe(
      OrderCursor.encode({ createdAt: AT, id: ID.replace('aa', 'ab') }),
    );
    expect(OrderCursor.encode({ createdAt: AT, id: ID })).not.toBe(
      OrderCursor.encode({ createdAt: new Date(AT.getTime() + 1), id: ID }),
    );
  });

  const b64 = (text: string) => Buffer.from(text).toString('base64url');
  it.each([
    ['vacío', ''],
    ['texto cualquiera', 'hola'],
    ['caracteres inválidos', 'a b+c/d=='],
    ['sin separador', b64('2026-10-28T12:34:56.789Z')],
    ['solo la fecha y el separador', b64('2026-10-28T12:34:56.789Z|')],
    ['fecha inválida', b64(`no-es-fecha|${ID}`)],
    ['fecha imposible', b64(`2026-13-45T99:99:99.999Z|${ID}`)],
    ['id que no es UUID', b64('2026-10-28T12:34:56.789Z|no-es-uuid')],
    [
      'id con SQL',
      b64(`2026-10-28T12:34:56.789Z|${ID}'; DROP TABLE sales.orders; --`),
    ],
    ['de más partes', b64(`2026-10-28T12:34:56.789Z|${ID}|extra`)],
    ['demasiado largo', 'A'.repeat(500)],
    ['fecha sin formato ISO', b64(`28/10/2026|${ID}`)],
    [
      '31 de febrero (JS lo convierte en marzo)',
      b64(`2026-02-31T10:00:00.000Z|${ID}`),
    ],
    [
      '31 de abril (JS lo convierte en mayo)',
      b64(`2026-04-31T10:00:00.000Z|${ID}`),
    ],
    [
      'hora 24:00 (JS pasa al día siguiente)',
      b64(`2026-10-28T24:00:00.000Z|${ID}`),
    ],
    ['fecha sin milisegundos', b64(`2026-10-28T10:00:00Z|${ID}`)],
  ])('un cursor %s no se decodifica', (_caso, value) => {
    expect(OrderCursor.decode(value)).toBeNull();
  });

  // El decodificador de Node ignora los caracteres que no son base64: sin comprobarlos, un cursor válido con ruido
  // seguiría valiendo y un mismo punto tendría muchos cursores distintos
  it.each([
    ['con un = de relleno', (c: string) => `${c}=`],
    [
      'con un espacio dentro',
      (c: string) => `${c.slice(0, 10)} ${c.slice(10)}`,
    ],
    ['con un salto de línea', (c: string) => `${c}\n`],
    ['con un + dentro', (c: string) => `${c.slice(0, 10)}+${c.slice(10)}`],
    ['con una / dentro', (c: string) => `${c.slice(0, 10)}/${c.slice(10)}`],
  ])('un cursor válido %s ya no es válido', (_caso, tamper) => {
    const valid = OrderCursor.encode({ createdAt: AT, id: ID });
    expect(OrderCursor.decode(valid)).not.toBeNull();
    expect(OrderCursor.decode(tamper(valid))).toBeNull();
  });

  it('nunca lanza: devuelve null con cualquier entrada', () => {
    for (const value of ['\u0000', '%%%', '💥', '=', '-', '_']) {
      expect(() => OrderCursor.decode(value)).not.toThrow();
    }
  });
});
