import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { Order } from '../../database/entities/order.entity';
import { Restaurant } from '../../database/entities/restaurant.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { WeeklyTemplate } from '../../database/entities/weekly-template.entity';
import { WeeklyTemplateRestaurant } from '../../database/entities/weekly-template-restaurant.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { DayPlanLifecycleService } from './day-plan-lifecycle.service';
import { DayPlansController } from './day-plans.controller';
import { DayPlansService } from './day-plans.service';
import { ExportService } from './export.service';
import { VoteService } from './vote.service';
import { WeeklyTemplatesController } from './weekly-templates.controller';
import { WeeklyTemplatesService } from './weekly-templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DayPlan,
      DayPlanRestaurant,
      RestaurantVote,
      Order,
      Restaurant,
      WeeklyTemplate,
      WeeklyTemplateRestaurant,
    ]),
    SettingsModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [DayPlansController, WeeklyTemplatesController],
  providers: [DayPlansService, DayPlanLifecycleService, VoteService, WeeklyTemplatesService, ExportService],
  exports: [DayPlansService, DayPlanLifecycleService],
})
export class PlanningModule {}
