import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { NotificationType, Role } from '../../database/entities/enums';
import { Notification } from '../../database/entities/notification.entity';
import { Order } from '../../database/entities/order.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { MailService } from './mail.service';
import { NotificationParams, notificationTexts } from './notification-texts';
import { PushService } from './push.service';

/**
 * Zentrale Verteilstelle: erzeugt In-App-Benachrichtigungen und versendet
 * E-Mail/Push gemäß Benutzereinstellungen — lokalisiert je Empfänger.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(RestaurantVote)
    private readonly votesRepository: Repository<RestaurantVote>,
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    private readonly mailService: MailService,
    private readonly pushService: PushService,
  ) {}

  // ---------- Versand ----------

  async notifyUsers(
    users: User[],
    type: NotificationType,
    params: NotificationParams,
    dayPlanId?: string,
  ): Promise<void> {
    if (users.length === 0) return;

    const rows = users.map((user) => {
      const texts = notificationTexts(type, user.locale, params);
      return this.notificationsRepository.create({
        userId: user.id,
        type,
        title: texts.title,
        message: texts.message,
        dayPlanId: dayPlanId ?? null,
      });
    });
    await this.notificationsRepository.save(rows);

    // E-Mail & Push fire-and-forget (Fehler blockieren die Transaktion nicht).
    void Promise.all(
      users.map(async (user) => {
        const texts = notificationTexts(type, user.locale, params);
        if (user.emailNotifications) {
          await this.mailService.send(user.email, texts.title, texts.message, user.locale);
        }
        if (user.pushNotifications) {
          await this.pushService.sendToUser(user.id, {
            title: texts.title,
            body: texts.message,
          });
        }
      }),
    );
  }

  // ---------- Empfängergruppen ----------

  activeUsers(): Promise<User[]> {
    return this.usersRepository.find({ where: { isActive: true, isAnonymized: false } });
  }

  admins(): Promise<User[]> {
    return this.usersRepository.find({
      where: { role: Role.ADMIN, isActive: true, isAnonymized: false },
    });
  }

  async usersWhoOrdered(dayPlanId: string): Promise<User[]> {
    const orders = await this.ordersRepository.find({ where: { dayPlanId } });
    const userIds = [...new Set(orders.map((order) => order.userId))];
    if (userIds.length === 0) return [];
    return this.usersRepository.find({
      where: { id: In(userIds), isActive: true, isAnonymized: false },
    });
  }

  /** Aktive Benutzer ohne Stimme im aktuellen Wahlgang. */
  async usersWithoutVote(dayPlanId: string, isRunoff: boolean): Promise<User[]> {
    const votes = await this.votesRepository.find({
      where: { dayPlanId, isRunoffVote: isRunoff },
    });
    const votedIds = new Set(votes.map((vote) => vote.userId));
    const active = await this.activeUsers();
    return active.filter((user) => !votedIds.has(user.id));
  }

  /** Aktive Benutzer ohne Bestellung des Tages. */
  async usersWithoutOrder(dayPlanId: string): Promise<User[]> {
    const orders = await this.ordersRepository.find({ where: { dayPlanId } });
    const orderedIds = new Set(orders.map((order) => order.userId));
    const active = await this.activeUsers();
    return active.filter((user) => !orderedIds.has(user.id));
  }

  /** Prüft, ob ein Benutzer für diesen Tag bereits eine Benachrichtigung dieses Typs hat (Dedup für Erinnerungen). */
  async alreadyNotified(userId: string, dayPlanId: string, type: NotificationType): Promise<boolean> {
    const count = await this.notificationsRepository.count({
      where: { userId, dayPlanId, type },
    });
    return count > 0;
  }

  // ---------- In-App-API ----------

  async list(userId: string, unreadOnly: boolean, page: number, limit: number) {
    const where = unreadOnly ? { userId, readAt: IsNull() } : { userId };
    const [items, total] = await this.notificationsRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const unreadCount = await this.notificationsRepository.count({
      where: { userId, readAt: IsNull() },
    });
    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        dayPlanId: n.dayPlanId,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      total,
      page,
      limit,
      unreadCount,
    };
  }

  async markRead(id: string, userId: string): Promise<void> {
    const notification = await this.notificationsRepository.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Benachrichtigung nicht gefunden');
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationsRepository.save(notification);
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationsRepository.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }
}
