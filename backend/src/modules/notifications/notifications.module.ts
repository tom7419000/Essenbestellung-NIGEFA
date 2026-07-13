import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { Order } from '../../database/entities/order.entity';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { MailService } from './mail.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, RestaurantVote, Order, PushSubscription]),
  ],
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, MailService, PushService],
  exports: [NotificationsService, MailService, PushService],
})
export class NotificationsModule {}
