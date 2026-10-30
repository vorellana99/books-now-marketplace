import { formatStartupBanner } from '../../../src/platform/observability/startup-banner.js';

const info = {
  baseUrl: 'http://localhost:3000',
  environment: 'development',
  database: 'localhost:5433/libroya',
  paymentProvider: 'fake',
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

  it('ya no habla de una API de administración habilitada o no: la protege el rol', () => {
    expect(formatStartupBanner(info)).not.toMatch(/Admin|habilitada/);
  });
});
