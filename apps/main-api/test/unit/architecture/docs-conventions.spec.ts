import { existsSync, readFileSync } from 'node:fs';
import { BATCH, LEASE_MS } from '../../../src/platform/outbox/outbox.relay.js';

const read = (path: string) => readFileSync(path, 'utf8');
const piezas = read('../../docs/backend/05-piezas-clave.md');
const claude = read('../../CLAUDE.md');
const relaySource = read('src/platform/outbox/outbox.relay.ts');

const read2 = (path: string) => readFileSync(path, 'utf8');
const decisiones = read2('../../docs/backend/01-decisiones-y-stack.md');
const estructura = read2(
  '../../docs/backend/02-estructura-y-puesta-en-marcha.md',
);
const tests = read2('../../docs/backend/06-tests.md');
const skills = ['nuevo-evento', 'nueva-ruta', 'nueva-migracion', 'tarea'].map(
  (name) => read2(`../../.claude/skills/${name}/SKILL.md`),
);

// Tarea 10.14: los cuatro contextos tienen la misma arquitectura y los documentos no dicen lo contrario
describe('una sola arquitectura (documentada)', () => {
  const section = piezas.slice(
    piezas.indexOf('### Convención por contexto'),
    piezas.indexOf('### Límites conocidos'),
  );

  it('05-piezas-clave describe una sola arquitectura para los cuatro contextos', () => {
    expect(piezas).toMatch(/### Convención por contexto/);
    for (const context of ['Ventas', 'Catálogo', 'Inventario', 'Identidad']) {
      expect(section, context).toContain(context);
    }
    expect(section).toMatch(/una sola arquitectura/i);
    expect(section).toMatch(/hexagonal/i);
  });

  it('nombra las carpetas de cada capa y dónde va cada pieza', () => {
    for (const part of [
      'domain/ports/',
      'application/',
      'interface/http/',
      'infrastructure/persistence/',
      'infrastructure/adapters/',
      'interface/consumers/',
    ]) {
      expect(section, part).toContain(part);
    }
  });

  it('dice qué tests la hacen cumplir', () => {
    expect(section).toContain('dependency-rules.spec.ts');
    expect(section).toContain('structure-rules.spec.ts');
  });

  it('ya no hay excepciones: desaparece «CQRS directo» y «Sin domain/»', () => {
    expect(section).not.toMatch(/CQRS directo/);
    expect(section).not.toMatch(/Sin `domain\/`/);
  });

  it('CLAUDE.md la resume y enlaza a la sección', () => {
    expect(claude).toMatch(/Convención por contexto/);
    expect(claude).toContain('05-piezas-clave.md#convención-por-contexto');
    expect(claude).toMatch(/una sola arquitectura/i);
    expect(claude).toContain('structure-rules.spec.ts');
  });

  it('ningún documento ni comando de Claude dice lo contrario', () => {
    const everything = [
      piezas,
      claude,
      decisiones,
      estructura,
      tests,
      ...skills,
    ];
    for (const text of everything) {
      expect(text).not.toMatch(/CQRS directo/);
      expect(text).not.toMatch(/Inventario sin repositorio/);
      expect(text).not.toMatch(/hexagonal completa/);
    }
  });

  it('01 y 02 dicen que application/ no usa Prisma ni infrastructure/, y que los consumidores van en interface/consumers/', () => {
    expect(decisiones).toContain('structure-rules.spec.ts');
    expect(decisiones).toMatch(/`application\/`[^\n]*no[^\n]*Prisma/);
    expect(estructura).toContain('interface/consumers/');
    expect(estructura).not.toMatch(/Consumidores que escriben en BD van en/);
  });

  // Tarea 10.16: qué es un caso de uso y cómo se ordena application/
  it('define qué es un caso de uso y cómo se ordena application/', () => {
    expect(section).toMatch(/Qué es un caso de uso/);
    for (const folder of [
      'application/use-cases/',
      'application/services/',
      'application/jobs/',
      'application/support/',
    ]) {
      expect(section, folder).toContain(folder);
    }
    expect(claude).toContain('use-cases/');
  });

  it('el ejemplo de cada contexto existe de verdad en src/', () => {
    const examples = [
      'sales/application/use-cases/order/place-order.handler.ts',
      'catalog/application/use-cases/book/create-book.handler.ts',
      'inventory/application/use-cases/stock/reserve-stock.handler.ts',
      'identity/application/use-cases/session/login.handler.ts',
    ];
    for (const example of examples) {
      expect(section, example).toContain(example);
      expect(existsSync(`src/contexts/${example}`), example).toBe(true);
    }
  });

  it('la lógica de negocio que estaba en application/ está en el dominio y los documentos lo dicen', () => {
    for (const file of [
      'src/contexts/sales/domain/model/order/normalize-cart.ts',
      'src/contexts/sales/domain/model/order/request-hash.ts',
      'src/contexts/sales/domain/model/order/checkout-replay.ts',
      'src/contexts/identity/domain/ports/access-token-issuer.port.ts',
    ]) {
      expect(existsSync(file), file).toBe(true);
    }
    expect(section).toMatch(/lógica pura/i);
    expect(section).toContain('support/');
  });

  // Tarea 10.17: domain/ se ordena igual que application/, la raíz por tipo de pieza y los nombres del negocio dentro
  // Tarea 10.18: la entrada (quien llama al contexto) y la salida (a quien llama) en carpetas distintas
  it('explica la separación entre interface/ (entrada) e infrastructure/ (salida)', () => {
    for (const part of [
      'interface/http/',
      'interface/consumers/',
      'infrastructure/persistence/',
      'infrastructure/adapters/',
    ]) {
      expect(section, part).toContain(part);
    }
    expect(section).toMatch(/quien llama al contexto/);
    expect(section).toMatch(/a quien llama el contexto/);
    expect(claude).toContain('interface/');
  });

  it('el controlador y el consumidor de ejemplo existen de verdad en interface/', () => {
    for (const example of [
      'sales/interface/http/order.controller.ts',
      'sales/interface/consumers/create-customer.consumer.ts',
    ]) {
      expect(section, example).toContain(example);
      expect(existsSync(`src/contexts/${example}`), example).toBe(true);
    }
  });

  it('explica cómo se ordena domain/: model/, ports/ y shared/', () => {
    for (const part of ['domain/model/', 'domain/ports/', 'domain/shared/']) {
      expect(section, part).toContain(part);
    }
    expect(claude).toContain('model/');
  });

  it('el ejemplo de agregado de cada contexto existe en domain/model/', () => {
    const examples = [
      'sales/domain/model/order/order.aggregate.ts',
      'catalog/domain/model/book/book.aggregate.ts',
      'inventory/domain/model/stock/stock-rules.ts',
      'identity/domain/model/user/user.aggregate.ts',
    ];
    for (const example of examples) {
      expect(section, example).toContain(example);
      expect(existsSync(`src/contexts/${example}`), example).toBe(true);
    }
  });

  it('/nuevo-evento manda el consumidor a interface/consumers/', () => {
    const nuevoEvento = skills[0];
    expect(nuevoEvento).toContain('interface/consumers/');
  });
});

describe('límites conocidos (documentados y ciertos)', () => {
  const limits = piezas.slice(piezas.indexOf('### Límites conocidos'));

  it('hay una sección de límites conocidos', () => {
    expect(piezas).toMatch(/### Límites conocidos/);
  });

  it('dice lo que el relay entrega por segundo y por qué BATCH y el bloqueo van juntos', () => {
    expect(limits).toMatch(/10 entregas por segundo por instancia/);
    expect(limits).toContain('BATCH × duración máxima por entrega');
    expect(limits).toContain('LEASE_MS');
  });

  it('reconoce que el relay no impone un tiempo máximo por entrega', () => {
    expect(limits).toMatch(/no impone un tiempo máximo por entrega/);
  });

  it('los números citados son los del código: lote de 10, una vuelta por segundo, bloqueo de 2 minutos', () => {
    expect(BATCH).toBe(10);
    expect(LEASE_MS).toBe(2 * 60_000);
    expect(relaySource).toContain('@Interval(1000)');
  });

  it('con el máximo supuesto de 10 s por entrega, un lote cabe en el bloqueo (la suposición del comentario del relay)', () => {
    const ASSUMED_MAX_DELIVERY_MS = 10_000;
    expect(BATCH * ASSUMED_MAX_DELIVERY_MS).toBeLessThan(LEASE_MS);
  });

  it('recoge los plazos de retención y lo que nunca se purga', () => {
    for (const name of [
      'RETENTION_OUTBOX_DAYS',
      'RETENTION_CHECKOUT_DAYS',
      'RETENTION_RESERVATION_DAYS',
      'RETENTION_REFRESH_TOKEN_DAYS',
    ]) {
      expect(limits, name).toContain(name);
    }
    expect(limits).toMatch(/nunca se purga/i);
  });

  it('recoge lo que sigue abierto: límites en memoria y cotización sin límite propio', () => {
    expect(limits).toMatch(/en memoria de cada instancia/);
    expect(limits).toMatch(/cotización/i);
  });
});
