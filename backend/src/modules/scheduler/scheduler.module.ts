import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanningModule } from '../planning/planning.module';
import { SettingsModule } from '../settings/settings.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DayPlan]),
    PlanningModule,
    SettingsModule,
    NotificationsModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
