import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserRole } from '../users/users.entity';
import { ROLES_KEY } from './roles.decorator';

// Guard que verifica si el usuario autenticado posee alguno de los roles requeridos
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Lee los roles requeridos desde los metadatos del handler o de la clase
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles() → no hay restricción de rol, se permite el acceso
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: User }>();

    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
