import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RESPONSE_CODE } from '../commons/constants';
import { AuthService } from '../modules/auth/auth.service';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(RESPONSE_CODE.auth.invalidToken);
    }

    const payload = this.authService.verifyToken(token);
    request.user = payload;
    return true;
  }

  private extractToken(request: { headers: Record<string, string> }): string | null {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.substring(7);
  }
}
