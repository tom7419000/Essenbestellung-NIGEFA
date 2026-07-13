import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { formatTimeInZone, todayInZone } from '../../common/utils/time.util';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { DayPlanStatus, NotificationType } from '../../database/entities/enums';
import { DayPlanLifecycleService } from '../planning/day-plan-lifecycle.service';
import { DayPlansService } from '../planning/day-plans.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Minütlicher Tick: erzeugt Tagespläne aus der Wochenvorlage, wendet fällige
 * Phasenübergänge an und versendet Erinnerungen. Alle Schritte sind idempotent;
 * bei mehreren Backend-Replikaten sollte nur eine Instanz SCHEDULER_ENABLED=true haben.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly enabled: boolean;
  private running = false;

  constructor(
    configService: ConfigService,
    @InjectRepository(DayPlan) private readonly dayPlansRepository: Repository<DayPlan>,
    private readonly dayPlansService: DayPlansService,
    private readonly lifecycleService: DayPlanLifecycleService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.enabled = configService.get<boolean>('schedulerEnabled') as boolean;
  }

  onApplicationBootstrap() {
    if (this.enabled) {
      // Catch-up direkt nach dem Start (z. B. nach Deployment/Ausfall).
      void this.tick();
    } else {
      this.logger.log('Scheduler ist deaktiviert (SCHEDULER_ENABLED=false).');
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.generateTodayPlanFromTemplate();
      await this.applyDueTransitions();
      await this.sendReminders();
    } catch (error) {
      this.logger.error(`Scheduler-Tick fehlgeschlagen: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async generateTodayPlanFromTemplate(): Promise<void> {
    const settings = await this.settingsService.getSettings();
    if (!settings.autoGenerateFromTemplate) return;
    const today = todayInZone(settings.timezone);
    const plan = await this.dayPlansService.generateFromTemplate(today, null);
    if (plan && plan.status === DayPlanStatus.SCHEDULED && plan.createdAt) {
      // openVoting übernimmt der Übergangs-Schritt unten.
    }
  }

  private async applyDueTransitions(): Promise<void> {
    const settings = await this.settingsService.getSettings();
    const today = todayInZone(settings.timezone);
    const plans = await this.dayPlansRepository.find({
      where: [
        { status: DayPlanStatus.SCHEDULED, date: today },
        { status: In([DayPlanStatus.VOTING_OPEN, DayPlanStatus.RUNOFF_VOTING, DayPlanStatus.ORDERING_OPEN]) },
      ],
    });
    for (const plan of plans) {
      await this.lifecycleService.catchUp(plan);
    }
  }

  /** Erinnerungen vor Fristablauf an alle, die noch nicht gewählt/bestellt haben. */
  private async sendReminders(): Promise<void> {
    const settings = await this.settingsService.getSettings();
    const lead = settings.reminderLeadMinutes * 60_000;
    const now = Date.now();

    const votingPlans = await this.dayPlansRepository.find({
      where: { status: DayPlanStatus.VOTING_OPEN },
    });
    for (const plan of votingPlans) {
      const deadline = plan.voteDeadline.getTime();
      if (now < deadline - lead || now >= deadline) continue;
      const candidates = await this.notificationsService.usersWithoutVote(plan.id, false);
      const recipients = [];
      for (const user of candidates) {
        if (!(await this.notificationsService.alreadyNotified(user.id, plan.id, NotificationType.VOTING_REMINDER))) {
          recipients.push(user);
        }
      }
      await this.notificationsService.notifyUsers(
        recipients,
        NotificationType.VOTING_REMINDER,
        { deadlineTime: formatTimeInZone(plan.voteDeadline, settings.timezone) },
        plan.id,
      );
    }

    const orderingPlans = await this.dayPlansRepository.find({
      where: { status: DayPlanStatus.ORDERING_OPEN },
      relations: { winnerRestaurant: true },
    });
    for (const plan of orderingPlans) {
      const deadline = plan.orderDeadline.getTime();
      if (now < deadline - lead || now >= deadline) continue;
      const candidates = await this.notificationsService.usersWithoutOrder(plan.id);
      const recipients = [];
      for (const user of candidates) {
        if (!(await this.notificationsService.alreadyNotified(user.id, plan.id, NotificationType.ORDERING_REMINDER))) {
          recipients.push(user);
        }
      }
      await this.notificationsService.notifyUsers(
        recipients,
        NotificationType.ORDERING_REMINDER,
        {
          deadlineTime: formatTimeInZone(plan.orderDeadline, settings.timezone),
          restaurantName: plan.winnerRestaurant?.name ?? '—',
        },
        plan.id,
      );
    }
  }
}
