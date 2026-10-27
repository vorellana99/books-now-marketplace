import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContext } from './request-context.js';

// Abre el contexto DESPUÉS del body-parser y antes de los pipes: validación, handler y todo lo que llamen lo heredan
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requestId: string = ctx.switchToHttp().getRequest().requestId;
    return new Observable((subscriber) =>
      RequestContext.run(requestId, () => next.handle().subscribe(subscriber)),
    );
  }
}
