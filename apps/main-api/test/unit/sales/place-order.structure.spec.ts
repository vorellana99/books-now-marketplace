import { readFileSync } from 'node:fs';

const FILE =
  'src/contexts/sales/application/use-cases/order/place-order.handler.ts';
const text = readFileSync(FILE, 'utf8');

// Cuántas líneas ocupa el cuerpo de un método de la clase (desde su firma hasta la llave que lo cierra, al mismo nivel)
function bodyLines(signature: RegExp): number {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => signature.test(l));
  if (start < 0) throw new Error(`no encuentro ${String(signature)}`);
  const indent = /^\s*/.exec(lines[start] ?? '')?.[0] ?? '';
  let end = start + 1;
  while (end < lines.length && lines[end] !== `${indent}}`) end++;
  return end - start - 1;
}

// La saga se lee de arriba abajo (tarea 9.10): `execute` solo cuenta los pasos y cada uno vive en su método. La
// conducta no cambia: la fijan las pruebas de `place-order.handler.spec.ts`
describe('estructura de PlaceOrderHandler', () => {
  it('execute cabe en una pantalla (60 líneas o menos)', () => {
    expect(bodyLines(/^\s{2}async execute\(/)).toBeLessThanOrEqual(60);
  });

  it('la compensación vive en su propio método, que se llama desde un solo sitio', () => {
    expect(text).toMatch(/private async compensate\(/);
    expect(text.match(/this\.compensate\(/g)).toHaveLength(1);
  });

  // Desde la tarea 10.16 el error vive en el dominio (`checkout-replay.ts`); el handler solo lo usa
  it('el error de «compra en curso» se construye en un solo sitio, en el dominio', () => {
    const domain = readFileSync(
      'src/contexts/sales/domain/order/checkout-replay.ts',
      'utf8',
    );
    expect(text).not.toContain('Esta compra todavía se está procesando');
    expect(
      domain.match(/Esta compra todavía se está procesando/g),
    ).toHaveLength(1);
    expect(text).toContain('checkoutInProgress()');
  });
});
