import { formatStartupBanner } from '../../src/platform/observability/startup-banner.js';

const info = {
  baseUrl: 'http://localhost:3000',
  environment: 'development',
  database: 'localhost:5433/libroya',
  paymentProvider: 'fake',
  adminApi: false,
};

describe('formatStartupBanner', () => {
  it('muestra las URLs, el entorno y la base', () => {
    const banner = formatStartupBanner(info);
    expect(banner).toContain('http://localhost:3000');
    expect(banner).toContain('http://localhost:3000/docs');
    expect(banner).toContain('http://localhost:3000/health/ready');
    expect(banner).toContain('development');
    expect(banner).toContain('localhost:5433/libroya');
    expect(banner).toContain('fake');
  });

  it('indica si la API de administración está habilitada', () => {
    expect(formatStartupBanner(info)).toContain('deshabilitada');
    expect(formatStartupBanner({ ...info, adminApi: true })).toContain(
      'habilitada',
    );
  });
});
