import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { PushSubscription } from '../../database/entities/push-subscription.entity';

/**
 * Optionale Web-Push-Benachrichtigungen (VAPID). Ohne konfigurierte
 * Schlüssel ist der Dienst inaktiv und die API meldet key = null.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;
  private readonly publicKey: string;

  constructor(
    configService: ConfigService,
    @InjectRepository(PushSubscription)
    private readonly subscriptionsRepository: Repository<PushSubscription>,
  ) {
    this.publicKey = configService.get<string>('vapid.publicKey') ?? '';
    const privateKey = configService.get<string>('vapid.privateKey') ?? '';
    this.enabled = Boolean(this.publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(
        configService.get<string>('vapid.subject') as string,
        this.publicKey,
        privateKey,
      );
    }
  }

  getPublicKey(): string | null {
    return this.enabled ? this.publicKey : null;
  }

  async subscribe(userId: string, endpoint: string, keys: { p256dh: string; auth: string }) {
    const existing = await this.subscriptionsRepository.findOne({ where: { endpoint } });
    if (existing) {
      existing.userId = userId;
      existing.keys = keys;
      await this.subscriptionsRepository.save(existing);
      return;
    }
    await this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({ userId, endpoint, keys }),
    );
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.subscriptionsRepository.delete({ userId, endpoint });
  }

  /** Sendet an alle Subscriptions eines Benutzers; verwaiste werden entfernt. */
  async sendToUser(userId: string, payload: { title: string; body: string }): Promise<void> {
    if (!this.enabled) return;
    const subscriptions = await this.subscriptionsRepository.find({ where: { userId } });
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: subscription.keys },
            JSON.stringify(payload),
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptionsRepository.delete({ id: subscription.id });
          } else {
            this.logger.warn(`Push an ${userId} fehlgeschlagen: ${String(error)}`);
          }
        }
      }),
    );
  }
}
