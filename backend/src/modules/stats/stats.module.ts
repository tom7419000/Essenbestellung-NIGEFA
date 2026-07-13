import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { Order } from '../../database/entities/order.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { SettingsModule } from '../settings/settings.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, DayPlan, RestaurantVote, Order]), SettingsModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
