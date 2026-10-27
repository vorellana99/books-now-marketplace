import { RequestAwareLogger } from '../../src/platform/observability/request-aware.logger.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';

describe('RequestContext y RequestAwareLogger', () => {
  it('expone el requestId solo dentro del contexto', async () => {
    expect(RequestContext.requestId()).toBeUndefined();
    await RequestContext.run('r-1', async () => {
      await Promise.resolve();
      expect(RequestContext.requestId()).toBe('r-1');
    });
    expect(RequestContext.requestId()).toBeUndefined();
  });

  it('agrega el requestId a cada línea del log', () => {
    const lines: string[] = [];
    const logger = new RequestAwareLogger({ json: true });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    try {
      RequestContext.run('r-7f3a', () => logger.log('hola'));
      logger.log('sin contexto');
    } finally {
      vi.restoreAllMocks();
    }
    expect(lines[0]).toContain('r-7f3a');
    expect(lines[1]).not.toContain('requestId');
  });
});
