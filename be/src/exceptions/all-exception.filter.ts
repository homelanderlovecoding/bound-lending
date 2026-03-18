import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, message } = this.extractErrorInfo(exception);

    this.logger.error(`${status} - ${message}`, exception instanceof Error ? exception.stack : '');

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private extractErrorInfo(exception: unknown): { status: number; message: string } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      return {
        status: exception.getStatus(),
        message: typeof res === 'string' ? res : (res as { message: string }).message ?? 'Error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: exception instanceof Error ? exception.message : 'Internal server error',
    };
  }
}
