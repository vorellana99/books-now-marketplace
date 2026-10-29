import { ExecutionContext } from '@nestjs/common';
import { defer, lastValueFrom, of } from 'rxjs';
import { RequestContext } from '../../../src/platform/observability/request-context.js';
import { RequestContextInterceptor } from '../../../src/platform/observability/request-context.interceptor.js';

describe('RequestContextInterceptor', () => {
  const contextWith = (requestId: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ requestId }) }),
    }) as unknown as ExecutionContext;

  it('abre el contexto con el requestId de la petición mientras corre el handler', async () => {
    const next = { handle: () => defer(() => of(RequestContext.requestId())) };

    const seen = await lastValueFrom(
      new RequestContextInterceptor().intercept(contextWith('r-9'), next),
    );

    expect(seen).toBe('r-9');
    expect(RequestContext.requestId()).toBeUndefined();
  });
});
