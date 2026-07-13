import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { toHHmm } from '../../common/utils/time.util';
import { Restaurant } from '../../database/entities/restaurant.entity';
import { WeeklyTemplate } from '../../database/entities/weekly-template.entity';
import { WeeklyTemplateRestaurant } from '../../database/entities/weekly-template-restaurant.entity';
import { AuditService } from '../audit/audit.service';
import { userRef } from '../users/users.service';
import { UpsertWeeklyTemplateDto } from './dto/day-plan.dto';

@Injectable()
export class WeeklyTemplatesService {
  constructor(
    @InjectRepository(WeeklyTemplate)
    private readonly templatesRepository: Repository<WeeklyTemplate>,
    @InjectRepository(WeeklyTemplateRestaurant)
    private readonly templateRestaurantsRepository: Repository<WeeklyTemplateRestaurant>,
    @InjectRepository(Restaurant)
    private readonly restaurantsRepository: Repository<Restaurant>,
    private readonly auditService: AuditService,
  ) {}

  /** Liefert alle 7 Wochentage; nicht konfigurierte Tage als inaktive Platzhalter. */
  async list() {
    const templates = await this.templatesRepository.find({
      relations: { restaurants: { restaurant: true }, organizer: true },
    });
    const byWeekday = new Map(templates.map((template) => [template.weekday, template]));

    return Array.from({ length: 7 }, (_, weekday) => {
      const template = byWeekday.get(weekday);
      if (!template) {
        return {
          weekday,
          isActive: false,
          restaurants: [],
          organizer: null,
          voteDeadlineTime: null,
          orderDeadlineTime: null,
          tieBreakStrategy: null,
        };
      }
      return this.toView(template);
    });
  }

  async upsert(weekday: number, dto: UpsertWeeklyTemplateDto, actorId: string) {
    if (weekday < 0 || weekday > 6) {
      throw new BadRequestException('weekday muss zwischen 0 (Sonntag) und 6 (Samstag) liegen');
    }
    const uniqueIds = [...new Set(dto.restaurantIds)];
    if (uniqueIds.length > 0) {
      const restaurants = await this.restaurantsRepository.count({
        where: { id: In(uniqueIds), isActive: true },
      });
      if (restaurants !== uniqueIds.length) {
        throw new BadRequestException('Mindestens ein Restaurant existiert nicht oder ist inaktiv');
      }
    }

    let template = await this.templatesRepository.findOne({ where: { weekday } });
    if (!template) {
      template = this.templatesRepository.create({ weekday });
    }
    template.isActive = dto.isActive ?? true;
    template.organizerId = dto.organizerId ?? null;
    template.voteDeadlineTime = dto.voteDeadlineTime ?? template.voteDeadlineTime ?? '10:00';
    template.orderDeadlineTime = dto.orderDeadlineTime ?? template.orderDeadlineTime ?? '11:30';
    template.tieBreakStrategy = dto.tieBreakStrategy ?? null;
    await this.templatesRepository.save(template);

    await this.templateRestaurantsRepository.delete({ weeklyTemplateId: template.id });
    if (uniqueIds.length > 0) {
      await this.templateRestaurantsRepository.save(
        uniqueIds.map((restaurantId) =>
          this.templateRestaurantsRepository.create({
            weeklyTemplateId: template.id,
            restaurantId,
          }),
        ),
      );
    }

    await this.auditService.log(actorId, 'weeklyTemplate.upsert', 'WeeklyTemplate', template.id, {
      weekday,
      restaurantIds: uniqueIds,
      isActive: template.isActive,
    });

    const fresh = await this.templatesRepository.findOne({
      where: { id: template.id },
      relations: { restaurants: { restaurant: true }, organizer: true },
    });
    return this.toView(fresh as WeeklyTemplate);
  }

  async remove(weekday: number, actorId: string): Promise<void> {
    const template = await this.templatesRepository.findOne({ where: { weekday } });
    if (!template) return;
    await this.templatesRepository.remove(template);
    await this.auditService.log(actorId, 'weeklyTemplate.delete', 'WeeklyTemplate', null, {
      weekday,
    });
  }

  private toView(template: WeeklyTemplate) {
    return {
      weekday: template.weekday,
      isActive: template.isActive,
      restaurants: (template.restaurants ?? []).map((entry) => ({
        id: entry.restaurant.id,
        name: entry.restaurant.name,
      })),
      organizer: template.organizer ? userRef(template.organizer) : null,
      voteDeadlineTime: toHHmm(template.voteDeadlineTime),
      orderDeadlineTime: toHHmm(template.orderDeadlineTime),
      tieBreakStrategy: template.tieBreakStrategy,
    };
  }
}
