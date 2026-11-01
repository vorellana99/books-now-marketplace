import setup from '../../support/global-setup.js';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('@testcontainers/postgresql', () => ({
  PostgreSqlContainer: class {
    withDatabase() {
      return this;
    }
    withUsername() {
      return this;
    }
    withPassword() {
      return this;
    }
    start() {
      return mocks.start();
    }
  },
}));
vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));

const ENV_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'INTEGRATION_DB_CONTAINER',
];

const startedContainer = () => ({
  getHost: () => 'localhost',
  getPort: () => 49321,
  getUsername: () => 'libroya',
  getPassword: () => 'secreto',
  getDatabase: () => 'libroya_test',
  stop: vi.fn().mockResolvedValue(undefined),
});

describe('globalSetup de los tests de integración', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  beforeEach(() => {
    vi.resetAllMocks();
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('sin Docker falla con un mensaje que dice qué hacer y no toca las variables', async () => {
    mocks.start.mockRejectedValue(
      new Error('Could not find a working container runtime strategy'),
    );

    const error = await setup().catch((e: Error) => e);

    expect((error as Error).message).toMatch(/Docker esté en marcha/);
    expect((error as Error).message).toMatch(/pnpm test/);
    expect((error as Error).message).toMatch(/container runtime strategy/); // conserva la causa
    expect(process.env.INTEGRATION_DB_CONTAINER).toBeUndefined();
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });

  it('define DB_* con los datos del contenedor y marca la base como aislada', async () => {
    mocks.start.mockResolvedValue(startedContainer());

    await setup();

    expect(process.env).toMatchObject({
      DB_HOST: 'localhost',
      DB_PORT: '49321',
      DB_USER: 'libroya',
      DB_PASSWORD: 'secreto',
      DB_NAME: 'libroya_test',
      INTEGRATION_DB_CONTAINER: '1',
    });
  });

  it('aplica las migraciones con prisma migrate deploy', async () => {
    mocks.start.mockResolvedValue(startedContainer());

    await setup();

    expect(mocks.execFileSync).toHaveBeenCalledWith(
      'pnpm',
      ['exec', 'prisma', 'migrate', 'deploy'],
      expect.objectContaining({
        env: expect.objectContaining({ DB_PORT: '49321' }),
      }),
    );
  });

  it('si fallan las migraciones, detiene el contenedor y muestra el motivo', async () => {
    const container = startedContainer();
    mocks.start.mockResolvedValue(container);
    mocks.execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('falló'), {
        stderr: Buffer.from('P3009: migración fallida'),
      });
    });

    await expect(setup()).rejects.toThrow(/P3009: migración fallida/);
    expect(container.stop).toHaveBeenCalledOnce();
  });

  it('la función devuelta detiene el contenedor al terminar', async () => {
    const container = startedContainer();
    mocks.start.mockResolvedValue(container);

    const teardown = await setup();
    expect(container.stop).not.toHaveBeenCalled();
    await teardown();

    expect(container.stop).toHaveBeenCalledOnce();
  });
});
