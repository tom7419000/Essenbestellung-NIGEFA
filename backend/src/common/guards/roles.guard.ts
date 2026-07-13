import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Globaler RBAC-Guard: wertet @Roles(...) aus. Ohne Metadaten → erlaubt. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) return false;
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Fehlende Berechtigung');
    }
    return true;
  }
}
