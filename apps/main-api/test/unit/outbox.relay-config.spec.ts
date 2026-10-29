import { ConfigService } from '@nestjs/config';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';

// El relay lee OUTBOX_MAX_ATTEMPTS del esquema de entorno, que ya trae su valor por defecto. Si la configuración no la
// trae, lo correcto es fallar con el nombre de la variable, no inventar un 8 propio
describe('OutboxRelay: configuración', () => {
  const failure = {
    eventId: '00000000-0000-0000-0000-000000000000',
    consumer: 'probe',
    attempts: 1,
  };

  it('sin OUTBOX_MAX_ATTEMPTS en la configuración, registrar un fallo lo dice por su nombre', async () => {
    const relay = new OutboxRelay(
      {} as never,
      {} as never,
      new ConfigService({}),
    );

    await expect(
      relay['recordFailure'](failure as never, new Error('boom')),
    ).rejects.toThrow(/OUTBOX_MAX_ATTEMPTS/);
  });
});
