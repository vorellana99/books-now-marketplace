import { readFileSync, readdirSync } from 'node:fs';
import { checkStructure } from '../../support/architecture.js';

// Cada regla de estructura tiene un caso que la rompe y uno que la cumple. Los contextos de ejemplo son completos para
// que lo único que falle sea lo que cada caso quiere probar
const BASE = {
  'src/contexts/demo/demo.module.ts': '',
  'src/contexts/demo/domain/ports/thing.repository.ts':
    'export abstract class ThingRepository {}',
  'src/contexts/demo/application/use-cases/thing/do-thing.handler.ts': '',
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
  const handler = `import { CommandHandler } from '@nestjs/cqrs';\n@CommandHandler(DoThing)\nexport class DoThingHandler {}`;
  const query = `import { QueryHandler } from '@nestjs/cqrs';\n@QueryHandler(AskThing)\nexport class AskThingHandler {}`;

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
      violations({
        [`${D}/application/use-cases/thing/h.ts`]: handler + query,
      }),
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
  const consumer = `import { Injectable } from '@nestjs/common';\n@OutboxHandler()\n@Injectable()\nexport class C {}`;

  it.each([
    ['application/', `${D}/application/services/c.consumer.ts`],
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
      violations({ [`${D}/application/services/x.controller.ts`]: '' }),
    ).toHaveLength(1);
    expect(
      violations({ [`${D}/infrastructure/http/x.controller.ts`]: '' }),
    ).toEqual([]);
  });

  it('un job solo en application/', () => {
    expect(
      violations({ [`${D}/infrastructure/adapters/x.job.ts`]: '' }),
    ).toHaveLength(1);
    expect(violations({ [`${D}/application/jobs/x.job.ts`]: '' })).toEqual([]);
  });

  it('una clase Prisma* solo en infrastructure/persistence/', () => {
    const source = `import { Injectable } from '@nestjs/common';\n@Injectable()\nexport class PrismaThing {}`;
    expect(
      violations({ [`${D}/infrastructure/adapters/p.ts`]: source }),
    ).toHaveLength(1);
    expect(
      violations({ [`${D}/application/services/p.ts`]: source }),
    ).toHaveLength(1);
    expect(
      violations({ [`${D}/infrastructure/persistence/p.ts`]: source }),
    ).toEqual([]);
  });
});

describe('application/ se ordena en use-cases/, services/, jobs/ y support/ (tarea 10.16)', () => {
  const APP = `${D}/application`;
  const message = (extra: Record<string, string>) => violations(extra);

  it.each(['use-cases/thing', 'services', 'jobs', 'support'])(
    'puede tener %s/',
    (dir) => {
      expect(message({ [`${APP}/${dir}/x.ts`]: '' })).toEqual([]);
    },
  );

  it.each(['order', 'stock', 'book', 'handlers'])(
    'no puede tener otra carpeta (%s/)',
    (dir) => {
      const found = message({ [`${APP}/${dir}/x.ts`]: '' });
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/use-cases, services, jobs, support/);
    },
  );

  it('no puede tener archivos sueltos en la raíz', () => {
    const found = message({ [`${APP}/helper.ts`]: '' });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/archivos sueltos/);
  });

  describe('los comandos, las consultas y los handlers viven en use-cases/<agregado>/', () => {
    it.each(['x.command.ts', 'x.query.ts', 'x.handler.ts'])(
      '%s está permitido en use-cases/<agregado>/',
      (file) => {
        expect(message({ [`${APP}/use-cases/thing/${file}`]: '' })).toEqual([]);
      },
    );

    it.each([
      ['services/', 'services'],
      ['jobs/', 'jobs'],
      ['support/', 'support'],
      ['use-cases/ sin carpeta de agregado', 'use-cases'],
    ])('en %s es una violación', (_donde, dir) => {
      for (const file of ['x.command.ts', 'x.query.ts', 'x.handler.ts']) {
        expect(message({ [`${APP}/${dir}/${file}`]: '' }), file).toHaveLength(
          1,
        );
      }
    });

    it('dos niveles dentro de use-cases/ tampoco', () => {
      expect(
        message({ [`${APP}/use-cases/thing/deep/x.handler.ts`]: '' }),
      ).toHaveLength(1);
    });
  });

  describe('los jobs viven en jobs/', () => {
    it('un job en use-cases/ o en services/ es una violación', () => {
      for (const dir of ['use-cases/thing', 'services', 'support']) {
        expect(message({ [`${APP}/${dir}/x.job.ts`]: '' }), dir).toHaveLength(
          1,
        );
      }
    });
  });

  describe('los puertos son clases abstractas de domain/ports/', () => {
    const port = 'export abstract class Gateway {}';

    it.each([
      ['application/services/', `${APP}/services/g.ts`],
      ['application/use-cases/', `${APP}/use-cases/thing/g.ts`],
      ['infrastructure/adapters/', `${D}/infrastructure/adapters/g.ts`],
      ['infrastructure/persistence/', `${D}/infrastructure/persistence/g.ts`],
    ])('una clase abstracta en %s es una violación', (_donde, path) => {
      expect(message({ [path]: port })).toHaveLength(1);
    });

    it('en domain/ports/ está permitida, y una clase base abstracta del dominio también', () => {
      expect(message({ [`${D}/domain/ports/g.ts`]: port })).toEqual([]);
      expect(
        message({ [`${D}/domain/shared/specification.ts`]: port }),
      ).toEqual([]);
    });

    it('la palabra abstract en un comentario no cuenta', () => {
      expect(
        message({
          [`${APP}/services/g.ts`]:
            "import { Injectable } from '@nestjs/common';\n// abstract class Gateway\n@Injectable()\nexport class Service {}",
        }),
      ).toEqual([]);
    });
  });

  describe('un archivo de application/ que es dominio puro va a domain/', () => {
    const pure = `import { Isbn } from '../../../shared-kernel/isbn.vo.js';\nexport function normalize(x: string) { return Isbn.create(x).value; }`;

    it.each(['services', 'jobs', 'use-cases/thing'])(
      'una función pura en %s/ es una violación (sin Nest, sin platform/ y sin puertos)',
      (dir) => {
        const found = message({ [`${APP}/${dir}/normalize.ts`]: pure });
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/domain\//);
      },
    );

    it('en support/ está permitida (el formato de la API, como el cursor de paginación)', () => {
      expect(message({ [`${APP}/support/cursor.ts`]: pure })).toEqual([]);
    });

    it('con Nest, con platform/ o con un puerto ya no es puro', () => {
      const nest = `import { Injectable } from '@nestjs/common';\n@Injectable()\nexport class Service {}`;
      const platform = `import { RequestContext } from '../../../../platform/observability/request-context.js';\nexport const id = () => RequestContext.current();`;
      const withPort = `import type { ThingRepository } from '../domain/ports/thing.repository.js';\nexport function run(repo: ThingRepository) { return repo; }`;
      for (const [name, source] of [
        ['nest', nest],
        ['platform', platform],
        ['puerto', withPort],
      ]) {
        expect(
          message({ [`${APP}/services/${name}.ts`]: source }),
          name,
        ).toEqual([]);
      }
    });

    it('un archivo de solo tipos (un DTO o un alias) no es dominio', () => {
      expect(
        message({
          [`${APP}/services/session.ts`]: `import type { Role } from '../../../shared-kernel/role.js';\nexport interface Session { role: Role }`,
        }),
      ).toEqual([]);
      expect(
        message({
          [`${APP}/use-cases/thing/view.ts`]: `export type { BookView as AdminBook } from '../../../domain/book-view.js';`,
        }),
      ).toEqual([]);
    });

    it('un comando, una consulta o un handler no se revisan como puros', () => {
      expect(
        message({
          [`${APP}/use-cases/thing/x.command.ts`]: `export class XCommand { constructor(readonly id: string) {} }`,
        }),
      ).toEqual([]);
    });
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
