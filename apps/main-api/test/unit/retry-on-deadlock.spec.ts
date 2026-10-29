import { retryOnDeadlock } from '../support/database.js';

const deadlock = () =>
  Object.assign(new Error('deadlock detected'), { code: '40P01' });

describe('retryOnDeadlock (ayuda de las pruebas)', () => {
  it('devuelve el resultado a la primera si no hay error', async () => {
    const op = vi.fn(() => Promise.resolve('ok'));

    expect(await retryOnDeadlock(op)).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('reintenta tras un interbloqueo y devuelve el resultado', async () => {
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(deadlock())
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValue('ok');

    expect(await retryOnDeadlock(op, { delayMs: 1 })).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('se rinde tras el máximo de intentos y lanza el interbloqueo', async () => {
    const op = vi.fn(() => Promise.reject(deadlock()));

    await expect(
      retryOnDeadlock(op, { attempts: 3, delayMs: 1 }),
    ).rejects.toThrow('deadlock detected');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('cualquier otro error sale a la primera, sin reintentar', async () => {
    const op = vi.fn(() =>
      Promise.reject(Object.assign(new Error('otra cosa'), { code: '23505' })),
    );

    await expect(retryOnDeadlock(op, { delayMs: 1 })).rejects.toThrow(
      'otra cosa',
    );
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('un error sin código tampoco se reintenta', async () => {
    const op = vi.fn(() => Promise.reject(new Error('sin código')));

    await expect(retryOnDeadlock(op, { delayMs: 1 })).rejects.toThrow(
      'sin código',
    );
    expect(op).toHaveBeenCalledTimes(1);
  });
});
