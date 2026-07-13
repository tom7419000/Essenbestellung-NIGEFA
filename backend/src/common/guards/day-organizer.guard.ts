import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';

/**
 * Erlaubt den Zugriff dem Organisator des jeweiligen Tagesplans (Pfadparameter :id)
 * sowie Administratoren. Der Organisator ist eine tagesbezogene Zuweisung, keine Rolle.
 */
@Injectable()
export class DayOrganizerGuard implements CanActivate {
  constructor(
    @InjectRepository(DayPlan) private readonly dayPlansRepository: Repository<DayPlan>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: User; params: { id?: string } }>();
    const user = request.user;
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;

    const planId = request.params.id;
    if (!planId) throw new ForbiddenException('Kein Tagesplan angegeben');

    const plan = await this.dayPlansRepository.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Tagesplan nicht gefunden');
    if (plan.organizerId !== user.id) {
      throw new ForbiddenException('Nur der Organisator dieses Tages (oder ein Admin)');
    }
    return true;
  }
}
