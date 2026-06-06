import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/users.entity';

// Clave utilizada por RolesGuard para leer los metadatos del decorador @Roles
export const ROLES_KEY = 'roles';

// Restringe el handler o controlador a los roles indicados
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
