import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './config/configuration';
import { ALL_ENTITIES, User } from './database/entities';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PlanningModule } from './modules/planning/planning.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SettingsModule } from './modules/settings/settings.module';
import { StatsModule } from './modules/stats/stats.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('db.host'),
        port: config.get<number>('db.port'),
        username: config.get<string>('db.user'),
        password: config.get<string>('db.password'),
        database: config.get<string>('db.name'),
        entities: ALL_ENTITIES,
        synchronize: config.get<boolean>('db.synchronize'),
        logging: false,
      }),
    }),
    // JwtModule global für den JwtAuthGuard; Secrets werden pro Aufruf übergeben.
    JwtModule.register({ global: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([User]),
    AuthModule,
    UsersModule,
    RestaurantsModule,
    PlanningModule,
    OrdersModule,
    NotificationsModule,
    StatsModule,
    SettingsModule,
    AuditModule,
    SchedulerModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
