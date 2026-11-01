import { existsSync, readFileSync } from 'node:fs';

// El Dockerfile genérico de la API (tarea 9.13). Estas pruebas leen el archivo; que la imagen de verdad construya y arranque
// se comprobó a mano (ver la bitácora de la tarea), porque construirla en cada compuerta costaría minutos y Docker
const dockerfile = existsSync('Dockerfile')
  ? readFileSync('Dockerfile', 'utf8')
  : '';
const dockerignore = existsSync('.dockerignore')
  ? readFileSync('.dockerignore', 'utf8')
  : '';
const lines = dockerfile.split('\n').map((l) => l.trim());
const has = (re: RegExp) => lines.some((l) => re.test(l));

describe('Dockerfile', () => {
  it('existe, con su .dockerignore', () => {
    expect(dockerfile).not.toBe('');
    expect(dockerignore).not.toBe('');
  });

  it('es de varias etapas y la última es la de ejecución (la que se construye por defecto)', () => {
    const stages = lines.filter((l) => /^FROM /i.test(l));
    expect(stages.length).toBeGreaterThanOrEqual(3);
    expect(stages.at(-1)).toMatch(/AS runtime$/i);
  });

  it('tiene una etapa `migrate` aparte para `prisma migrate deploy`', () => {
    expect(has(/^FROM .* AS migrate$/i)).toBe(true);
    expect(dockerfile).toMatch(/prisma.*migrate deploy/);
  });

  it('todas las etapas usan Node 24, y pnpm tiene la versión del proyecto', () => {
    const nodeStages = lines.filter((l) => /^FROM node:/i.test(l));
    expect(nodeStages.length).toBeGreaterThanOrEqual(2);
    for (const stage of nodeStages) expect(stage).toMatch(/^FROM node:24/);
    expect(dockerfile).toContain('pnpm@12.15.0');
  });

  it('toda instalación de dependencias usa el lockfile congelado', () => {
    const installs = lines.filter((l) => /\bpnpm install\b/.test(l));
    expect(installs.length).toBeGreaterThanOrEqual(2);
    for (const install of installs)
      expect(install).toContain('--frozen-lockfile');
  });

  it('la etapa de ejecución instala solo dependencias de producción', () => {
    expect(dockerfile).toMatch(/pnpm install .*--prod/);
  });

  it('no corre como root: la imagen final usa el usuario `node`', () => {
    const lastUser = lines.filter((l) => /^USER /i.test(l)).at(-1);
    expect(lastUser).toBe('USER node');
  });

  it('arranca con `node dist/main.js` y no con pnpm ni nest', () => {
    expect(has(/^CMD \["node", "dist\/main\.js"\]$/)).toBe(true);
  });

  it('expone el puerto de la API y trae un HEALTHCHECK contra /health/live', () => {
    expect(has(/^EXPOSE 3000$/)).toBe(true);
    expect(dockerfile).toMatch(/HEALTHCHECK[\s\S]*\/health\/live/);
  });

  it('no copia las pruebas, los .env ni el código de desarrollo a la etapa de ejecución', () => {
    const runtime = dockerfile.slice(dockerfile.search(/FROM .* AS runtime/i));
    expect(runtime).not.toMatch(/COPY .*\btest\b/);
    expect(runtime).not.toMatch(/COPY .*\.env/);
    expect(runtime).not.toMatch(/COPY \. /);
  });

  it('.dockerignore deja fuera lo que no debe entrar al contexto', () => {
    for (const entry of [
      'node_modules',
      'dist',
      'coverage',
      '.env',
      'test',
      '.git',
    ]) {
      expect(dockerignore.split('\n').map((l) => l.trim())).toContain(entry);
    }
  });

  it('no deja secretos en la imagen: ningún ENV con contraseñas ni JWT_SECRET', () => {
    expect(dockerfile).not.toMatch(/^ENV .*(PASSWORD|SECRET)/im);
  });
});
