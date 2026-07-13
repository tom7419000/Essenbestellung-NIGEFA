import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { MenuItem } from '../../database/entities/menu-item.entity';
import { Order } from '../../database/entities/order.entity';
import { Restaurant } from '../../database/entities/restaurant.entity';
import { AuditModule } from '../audit/audit.module';
import { MenuImportService } from './menu-import.service';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Restaurant, MenuItem, DayPlanRestaurant, Order]),
    AuditModule,
  ],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, MenuImportService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
