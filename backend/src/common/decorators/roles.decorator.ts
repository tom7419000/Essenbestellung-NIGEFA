import { SetMetadata } from '@nestjs/common';
import { Role } from '../../database/entities/enums';

export const ROLES_KEY = 'roles';

/** Beschränkt einen Endpunkt auf bestimmte Rollen (RBAC). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
