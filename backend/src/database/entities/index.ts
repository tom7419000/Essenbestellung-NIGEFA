import { AppSetting } from './app-setting.entity';
import { AuditLog } from './audit-log.entity';
import { DayPlan } from './day-plan.entity';
import { DayPlanRestaurant } from './day-plan-restaurant.entity';
import { MenuItem } from './menu-item.entity';
import { Notification } from './notification.entity';
import { Order } from './order.entity';
import { PushSubscription } from './push-subscription.entity';
import { RefreshToken } from './refresh-token.entity';
import { Restaurant } from './restaurant.entity';
import { RestaurantVote } from './restaurant-vote.entity';
import { User } from './user.entity';
import { WeeklyTemplate } from './weekly-template.entity';
import { WeeklyTemplateRestaurant } from './weekly-template-restaurant.entity';

export * from './app-setting.entity';
export * from './audit-log.entity';
export * from './day-plan.entity';
export * from './day-plan-restaurant.entity';
export * from './enums';
export * from './menu-item.entity';
export * from './notification.entity';
export * from './order.entity';
export * from './push-subscription.entity';
export * from './refresh-token.entity';
export * from './restaurant.entity';
export * from './restaurant-vote.entity';
export * from './user.entity';
export * from './weekly-template.entity';
export * from './weekly-template-restaurant.entity';

export const ALL_ENTITIES = [
  AppSetting,
  AuditLog,
  DayPlan,
  DayPlanRestaurant,
  MenuItem,
  Notification,
  Order,
  PushSubscription,
  RefreshToken,
  Restaurant,
  RestaurantVote,
  User,
  WeeklyTemplate,
  WeeklyTemplateRestaurant,
];
