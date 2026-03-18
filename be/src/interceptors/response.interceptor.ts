import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface IResponse<T> {
  data?: T;
  metaData?: Record<string, unknown>;
  message?: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, IResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<IResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If already wrapped in response format, pass through
        if (data && typeof data === 'object' && 'data' in data) {
          return data as IResponse<T>;
        }
        // Auto-wrap raw returns
        return { data, message: 'Success' };
      }),
    );
  }
}
