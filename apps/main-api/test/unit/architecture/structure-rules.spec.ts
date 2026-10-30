import { readFileSync, readdirSync } from 'node:fs';
import { checkStructure } from '../../support/architecture.js';

// Cada regla de estructura tiene un caso que la rompe y uno que la cumple. Los contextos de ejemplo son completos para
// que lo único que falle sea lo que cada caso quiere probar
const BASE = {
  'src/contexts/demo/demo.module.ts': '',
  'src/contexts/demo/domain/ports/thing.repository.ts':
    'export abstract class ThingRepository {}',
  'src/contexts/demo/application/do-thing.handler.ts': '',
  'src/contexts/demo/infrastructure/persistence/prisma-thing.repository.ts': '',
};
const violations = (extra: Record<string, string>, drop: string[] = []) => {
  const files = { ...BASE, ...extra };
  for (const key of drop) delete (files as Record<string, string>)[key];
  return checkStructure(files);
};
const D = 'src/contexts/demo';

describe('checkStructure: el contexto de ejemplo cumple las reglas', () => {
  it('un contexto completo no tiene violaciones', () => {
    expect(violations({})).toEqual([]);
  });
});

describe('la raíz de cada contexto', () => {
  it('solo tiene domain/, application/, infrastructure/ y su módulo', () => {
    expect(violations({ [`${D}/shared/util.ts`]: '' })).toHaveLength(1);
    expect(violations({ [`${D}/helper.ts`]: '' })).toHaveLength(1);
  });

  it('exige el módulo <contexto>.module.ts', () => {
    expect(violations({}, [`${D}/demo.module.ts`])).toHaveLength(1);
  });
});

describe('infrastructure/ se divide en http, persistence, adapters y consumers', () => {
  it.each(['http', 'persistence', 'adapters', 'consumers'])(
    'puede tener %s/',
    (dir) => {
      expect(violations({ [`${D}/infrastructure/${dir}/x.ts`]: '' })).toEqual(
        [],
      );
    },
  );

  it.each(['stock', 'book', 'jobs', 'order'])(
    'no puede tener otra carpeta (%s/)',
    (dir) => {
      expect(
        violations({ [`${D}/infrastructure/${dir}/x.ts`]: '' }),
      ).toHaveLength(1);
    },
  );

  it('no puede tener archivos sueltos, y el mensaje lo dice', () => {
    const found = violations({ [`${D}/infrastructure/helper.ts`]: '' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/archivos sueltos/);
  });
});

describe('los handlers de CQRS viven en application/', () => {
  const handler = `@CommandHandler(DoThing)\nexport class DoThingHandler {}`;
  const query = `@QueryHandler(AskThing)\nexport class AskThingHandler {}`;

  it.each([
    ['un @CommandHandler', handler],
    ['un @QueryHandler', query],
  ])('%s en infrastructure/ es una violación', (_que, source) => {
    for (const dir of ['persistence', 'http', 'adapters', 'consumers']) {
      expect(
        violations({ [`${D}/infrastructure/${dir}/h.ts`]: source }),
      ).toHaveLength(1);
    }
  });

  it('en domain/ también lo es', () => {
    expect(violations({ [`${D}/domain/h.ts`]: handler })).toHaveLength(1);
  });

  it('en application/ está permitido', () => {
    expect(
      violations({ [`${D}/application/a/h.ts`]: handler + query }),
    ).toEqual([]);
  });

  it('el texto de un comentario no cuenta', () => {
    expect(
      violations({
        [`${D}/infrastructure/persistence/h.ts`]: `// @CommandHandler(X) va en application/\nexport class H {}`,
      }),
    ).toEqual([]);
  });
});

describe('los consumidores del Outbox viven en infrastructure/consumers/', () => {
  const consumer = `@OutboxHandler()\n@Injectable()\nexport class C {}`;

  it.each([
    ['application/', `${D}/application/c.consumer.ts`],
    ['domain/', `${D}/domain/c.consumer.ts`],
    ['infrastructure/persistence/', `${D}/infrastructure/persistence/c.ts`],
    ['infrastructure/http/', `${D}/infrastructure/http/c.ts`],
  ])('un @OutboxHandler en %s es una violación', (_donde, path) => {
    expect(violations({ [path]: consumer })).toHaveLength(1);
  });

  it('en infrastructure/consumers/ está permitido', () => {
    expect(
      violations({
        [`${D}/infrastructure/consumers/c.consumer.ts`]: consumer,
      }),
    ).toEqual([]);
  });
});

describe('cada tipo de pieza en su carpeta', () => {
  it('un controlador solo en infrastructure/http/', () => {
    expect(
      violations({ [`${D}/infrastructure/persistence/x.controller.ts`]: '' }),
    ).toHaveLength(1);
    expect(
      violations({ [`${D}/application/x.controller.ts`]: '' }),
    ).toHaveLength(1);
    expect(
      violations({ [`${D}/infrastructure/http/x.controller.ts`]: '' }),
    ).toEqual([]);
  });

  it('un job solo en application/', () => {
    expect(
      violations({ [`${D}/infrastructure/adapters/x.job.ts`]: '' }),
    ).toHaveLength(1);
    expect(violations({ [`${D}/application/x.job.ts`]: '' })).toEqual([]);
  });

  it('una clase Prisma* solo en infrastructure/persistence/', () => {
    const source = 'export class PrismaThing {}';
    expect(
      violations({ [`${D}/infrastructure/adapters/p.ts`]: source }),
    ).toHaveLength(1);
    expect(violations({ [`${D}/application/p.ts`]: source })).toHaveLength(1);
    expect(
      violations({ [`${D}/infrastructure/persistence/p.ts`]: source }),
    ).toEqual([]);
  });
});

describe('los puertos viven en domain/ports/', () => {
  it('cada contexto tiene domain/ports/', () => {
    expect(
      violations({}, [`${D}/domain/ports/thing.repository.ts`]),
    ).toHaveLength(1);
  });

  it('un *.port.ts o *.repository.ts fuera de domain/ports/ es una violación', () => {
    expect(
      violations({
        [`${D}/domain/order/order.repository.ts`]: 'export abstract class R {}',
      }),
    ).toHaveLength(1);
    expect(
      violations({
        [`${D}/domain/notifier.port.ts`]: 'export abstract class N {}',
      }),
    ).toHaveLength(1);
  });

  it('un archivo de domain/ports/ declara una clase abstracta', () => {
    expect(
      violations({ [`${D}/domain/ports/x.ts`]: 'export class X {}' }),
    ).toHaveLength(1);
    expect(
      violations({ [`${D}/domain/ports/x.ts`]: 'export abstract class X {}' }),
    ).toEqual([]);
  });

  it('un puerto sin la palabra abstract solo en un comentario no cuenta', () => {
    expect(
      violations({
        [`${D}/domain/ports/x.ts`]: '// abstract class X\nexport class X {}',
      }),
    ).toHaveLength(1);
  });
});

describe('el código real de src/contexts/ cumple las reglas de estructura', () => {
  const files: Record<string, string> = {};
  for (const entry of readdirSync('src/contexts', {
    recursive: true,
    encoding: 'utf8',
  })) {
    const path = `src/contexts/${entry.replaceAll('\\', '/')}`;
    if (path.endsWith('.ts')) files[path] = readFileSync(path, 'utf8');
  }

  it('lee los cuatro contextos (la prueba no pasa en vacío)', () => {
    const contexts = new Set(Object.keys(files).map((f) => f.split('/')[2]));
    expect([...contexts].sort()).toEqual([
      'catalog',
      'identity',
      'inventory',
      'sales',
    ]);
  });

  it('no tiene violaciones', () => {
    expect(checkStructure(files)).toEqual([]);
  });
});
