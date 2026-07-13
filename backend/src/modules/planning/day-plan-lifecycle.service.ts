import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { formatTimeInZone, todayInZone } from '../../common/utils/time.util';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { DayPlanStatus, NotificationType, TieBreakStrategy } from '../../database/entities/enums';
import { Restaurant } from '../../database/entities/restaurant.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { DayPlansService } from './day-plans.service';
import { evaluateVoting, pickRandom } from './tally.util';

const MANUAL_REOPEN_MINUTES = 30;

/**
 * Zustandsmaschine des Tagesplans. Alle Übergänge laufen in einer Transaktion
 * mit Zeilensperre — Scheduler, Lese-Catch-up und manuelle Admin-Aktionen
 * können sich dadurch nicht doppeln. Benachrichtigungen werden erst nach
 * erfolgreichem Commit versendet.
 */
@Injectable()
export class DayPlanLifecycleService {
  private readonly logger = new Logger(DayPlanLifecycleService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DayPlan) private readonly dayPlansRepository: Repository<DayPlan>,
    @InjectRepository(Restaurant) private readonly restaurantsRepository: Repository<Restaurant>,
    private readonly dayPlansService: DayPlansService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  // ---------- Öffentliche Übergänge ----------

  /** Abstimmung öffnen. Manuell: bereits abgelaufene Frist wird um 30 min verlängert. */
  async openVoting(planId: string, actorId: string | null, strict = true): Promise<void> {
    const settings = await this.settingsService.getSettings();
    const result = await this.withLockedPlan(planId, async (plan, manager) => {
      if (plan.status !== DayPlanStatus.SCHEDULED) {
        if (strict) throw new ConflictException(`Abstimmung kann im Status ${plan.status} nicht geöffnet werden`);
        return null;
      }
      const now = new Date();
      if (plan.voteDeadline <= now) {
        if (!actorId) return null; // Scheduler öffnet keine abgelaufenen Pläne
        plan.voteDeadline = new Date(now.getTime() + MANUAL_REOPEN_MINUTES * 60_000);
        if (plan.orderDeadline <= plan.voteDeadline) {
          plan.orderDeadline = new Date(plan.voteDeadline.getTime() + 60 * 60_000);
        }
      }
      plan.status = DayPlanStatus.VOTING_OPEN;
      await manager.save(plan);
      return { deadline: plan.voteDeadline };
    });
    if (!result) return;

    await this.auditService.log(actorId, 'dayplan.openVoting', 'DayPlan', planId);
    const users = await this.notificationsService.activeUsers();
    await this.notificationsService.notifyUsers(
      users,
      NotificationType.VOTING_OPENED,
      { deadlineTime: formatTimeInZone(result.deadline, settings.timezone) },
      planId,
    );
  }

  /**
   * Abstimmung schließen und auszählen — Kern der Phase-1-Logik.
   * Gleichstand → Stichwahl oder Admin-Entscheidung (konfigurierbar).
   */
  async closeVoting(planId: string, actorId: string | null, strict = true): Promise<void> {
    const settings = await this.settingsService.getSettings();

    type CloseResult =
      | { type: 'cancelled' }
      | { type: 'winner'; restaurantId: string }
      | { type: 'lottery'; restaurantId: string; candidateIds: string[] }
      | { type: 'runoff'; candidateIds: string[]; deadline: Date }
      | { type: 'tie_admin'; candidateIds: string[] };

    const result = await this.withLockedPlan<CloseResult | null>(planId, async (plan, manager) => {
      if (plan.status !== DayPlanStatus.VOTING_OPEN) {
        if (strict) throw new ConflictException(`Abstimmung ist nicht offen (Status ${plan.status})`);
        return null;
      }
      const options = await manager.find(DayPlanRestaurant, { where: { dayPlanId: plan.id } });
      const votes = await manager.find(RestaurantVote, {
        where: { dayPlanId: plan.id, isRunoffVote: false },
      });
      const outcome = evaluateVoting(votes, options.map((option) => option.restaurantId));

      if (outcome.kind === 'no_votes') {
        plan.status = DayPlanStatus.CANCELLED;
        await manager.save(plan);
        return { type: 'cancelled' };
      }

      if (outcome.kind === 'winner') {
        plan.winnerRestaurantId = outcome.restaurantId;
        plan.status = DayPlanStatus.ORDERING_OPEN;
        await manager.save(plan);
        return { type: 'winner', restaurantId: outcome.restaurantId };
      }

      // Gleichstand
      if (plan.tieBreakStrategy === TieBreakStrategy.ADMIN_DECISION) {
        plan.status = DayPlanStatus.TIE_ADMIN_DECISION;
        await manager.save(plan);
        return { type: 'tie_admin', candidateIds: outcome.candidateIds };
      }

      // Stichwahl — nur wenn vor der Bestellfrist genug Zeit bleibt, sonst Losentscheid.
      const runoffDeadline = new Date(Date.now() + settings.runoffMinutes * 60_000);
      if (runoffDeadline >= plan.orderDeadline) {
        const winnerId = pickRandom(outcome.candidateIds);
        plan.winnerRestaurantId = winnerId;
        plan.status = DayPlanStatus.ORDERING_OPEN;
        await manager.save(plan);
        return { type: 'lottery', restaurantId: winnerId, candidateIds: outcome.candidateIds };
      }

      await manager.update(
        DayPlanRestaurant,
        { dayPlanId: plan.id, restaurantId: In(outcome.candidateIds) },
        { isRunoffCandidate: true },
      );
      plan.status = DayPlanStatus.RUNOFF_VOTING;
      plan.runoffDeadline = runoffDeadline;
      await manager.save(plan);
      return { type: 'runoff', candidateIds: outcome.candidateIds, deadline: runoffDeadline };
    });
    if (!result) return;

    const timezone = settings.timezone;
    switch (result.type) {
      case 'cancelled': {
        await this.auditService.log(actorId, 'dayplan.closeVoting', 'DayPlan', planId, {
          outcome: 'no_votes → cancelled',
        });
        await this.notifyAll(NotificationType.DAY_CANCELLED, planId, {});
        break;
      }
      case 'winner': {
        await this.auditService.log(actorId, 'dayplan.closeVoting', 'DayPlan', planId, {
          outcome: 'winner',
          restaurantId: result.restaurantId,
        });
        await this.announceWinner(planId, result.restaurantId, timezone);
        break;
      }
      case 'lottery': {
        await this.auditService.log(null, 'dayplan.lottery', 'DayPlan', planId, {
          candidateIds: result.candidateIds,
          pickedRestaurantId: result.restaurantId,
          reason: 'Keine Zeit für Stichwahl vor der Bestellfrist',
        });
        await this.announceWinner(planId, result.restaurantId, timezone);
        break;
      }
      case 'runoff': {
        await this.auditService.log(actorId, 'dayplan.startRunoff', 'DayPlan', planId, {
          candidateIds: result.candidateIds,
          runoffDeadline: result.deadline.toISOString(),
        });
        await this.notifyAll(NotificationType.RUNOFF_STARTED, planId, {
          deadlineTime: formatTimeInZone(result.deadline, timezone),
        });
        break;
      }
      case 'tie_admin': {
        await this.auditService.log(actorId, 'dayplan.tieAdminDecision', 'DayPlan', planId, {
          candidateIds: result.candidateIds,
        });
        const admins = await this.notificationsService.admins();
        await this.notificationsService.notifyUsers(
          admins,
          NotificationType.TIE_ADMIN_ACTION,
          {},
          planId,
        );
        break;
      }
    }
  }

  /** Stichwahl schließen; bei erneutem Gleichstand entscheidet das Los. */
  async closeRunoff(planId: string, actorId: string | null, strict = true): Promise<void> {
    const settings = await this.settingsService.getSettings();

    const result = await this.withLockedPlan(planId, async (plan, manager) => {
      if (plan.status !== DayPlanStatus.RUNOFF_VOTING) {
        if (strict) throw new ConflictException(`Keine laufende Stichwahl (Status ${plan.status})`);
        return null;
      }
      const candidates = await manager.find(DayPlanRestaurant, {
        where: { dayPlanId: plan.id, isRunoffCandidate: true },
      });
      const candidateIds = candidates.map((candidate) => candidate.restaurantId);
      const votes = await manager.find(RestaurantVote, {
        where: { dayPlanId: plan.id, isRunoffVote: true },
      });
      const outcome = evaluateVoting(votes, candidateIds);

      let winnerId: string;
      let byLottery = false;
      if (outcome.kind === 'winner') {
        winnerId = outcome.restaurantId;
      } else {
        // keine Stimmen oder erneuter Gleichstand → Losentscheid
        const pool = outcome.kind === 'tie' ? outcome.candidateIds : candidateIds;
        winnerId = pickRandom(pool);
        byLottery = true;
      }
      plan.winnerRestaurantId = winnerId;
      plan.status = DayPlanStatus.ORDERING_OPEN;
      plan.runoffDeadline = null;
      await manager.save(plan);
      return { winnerId, byLottery, candidateIds };
    });
    if (!result) return;

    await this.auditService.log(
      result.byLottery ? null : actorId,
      result.byLottery ? 'dayplan.lottery' : 'dayplan.closeRunoff',
      'DayPlan',
      planId,
      { candidateIds: result.candidateIds, pickedRestaurantId: result.winnerId },
    );
    await this.announceWinner(planId, result.winnerId, settings.timezone);
  }

  /** Admin löst einen Gleichstand auf (oder korrigiert den Gewinner, solange keine Bestellungen existieren). */
  async decideWinner(planId: string, restaurantId: string, actorId: string): Promise<void> {
    const settings = await this.settingsService.getSettings();

    await this.withLockedPlan(planId, async (plan, manager) => {
      const allowed =
        plan.status === DayPlanStatus.TIE_ADMIN_DECISION ||
        plan.status === DayPlanStatus.RUNOFF_VOTING ||
        (plan.status === DayPlanStatus.ORDERING_OPEN &&
          (await this.dayPlansService.countDistinctOrderUsers(plan.id)) === 0);
      if (!allowed) {
        throw new ConflictException(
          `Gewinner kann im Status ${plan.status} nicht (mehr) festgelegt werden`,
        );
      }
      const option = await manager.findOne(DayPlanRestaurant, {
        where: { dayPlanId: plan.id, restaurantId },
      });
      if (!option) {
        throw new BadRequestException('Dieses Restaurant steht heute nicht zur Wahl');
      }
      plan.winnerRestaurantId = restaurantId;
      plan.status = DayPlanStatus.ORDERING_OPEN;
      plan.runoffDeadline = null;
      await manager.save(plan);
      return true;
    });

    await this.auditService.log(actorId, 'dayplan.decideWinner', 'DayPlan', planId, {
      restaurantId,
    });
    await this.announceWinner(planId, restaurantId, settings.timezone);
  }

  /** Bestellphase schließen; Organisator erhält die Zusammenfassung. */
  async closeOrdering(planId: string, actorId: string | null, strict = true): Promise<void> {
    const result = await this.withLockedPlan(planId, async (plan, manager) => {
      if (plan.status !== DayPlanStatus.ORDERING_OPEN) {
        if (strict) throw new ConflictException(`Bestellphase ist nicht offen (Status ${plan.status})`);
        return null;
      }
      plan.status = DayPlanStatus.ORDERING_CLOSED;
      await manager.save(plan);
      return { organizerId: plan.organizerId, winnerRestaurantId: plan.winnerRestaurantId };
    });
    if (!result) return;

    await this.auditService.log(actorId, 'dayplan.closeOrdering', 'DayPlan', planId);

    const participantCount = await this.dayPlansService.countDistinctOrderUsers(planId);
    const winner = result.winnerRestaurantId
      ? await this.restaurantsRepository.findOne({ where: { id: result.winnerRestaurantId } })
      : null;
    const recipients = result.organizerId
      ? await this.notificationsService
          .activeUsers()
          .then((users) => users.filter((user) => user.id === result.organizerId))
      : await this.notificationsService.admins();
    await this.notificationsService.notifyUsers(
      recipients,
      NotificationType.ORGANIZER_REMINDER,
      { restaurantName: winner?.name ?? '—', count: participantCount },
      planId,
    );
  }

  /** Bestellphase wieder öffnen (Nachzügler); abgelaufene Frist wird verlängert. */
  async reopenOrdering(planId: string, actorId: string): Promise<void> {
    await this.withLockedPlan(planId, async (plan, manager) => {
      if (plan.status !== DayPlanStatus.ORDERING_CLOSED) {
        throw new ConflictException(`Bestellphase kann im Status ${plan.status} nicht geöffnet werden`);
      }
      const now = new Date();
      if (plan.orderDeadline <= now) {
        plan.orderDeadline = new Date(now.getTime() + MANUAL_REOPEN_MINUTES * 60_000);
      }
      plan.status = DayPlanStatus.ORDERING_OPEN;
      await manager.save(plan);
      return true;
    });
    await this.auditService.log(actorId, 'dayplan.reopenOrdering', 'DayPlan', planId);
  }

  /** Organisator-Workflow: Bestellt/Geliefert + Kommentar. */
  async setOrderStatus(
    planId: string,
    status: 'ORDERED' | 'DELIVERED' | undefined,
    note: string | undefined,
    actorId: string,
  ): Promise<void> {
    const result = await this.withLockedPlan(planId, async (plan, manager) => {
      const allowedCurrent = [
        DayPlanStatus.ORDERING_CLOSED,
        DayPlanStatus.ORDERED,
        DayPlanStatus.DELIVERED,
      ];
      if (!allowedCurrent.includes(plan.status)) {
        throw new ConflictException(
          `Bestellstatus kann im Status ${plan.status} nicht gesetzt werden (Bestellphase zuerst schließen)`,
        );
      }
      let changed: 'ORDERED' | 'DELIVERED' | null = null;
      if (status === 'ORDERED') {
        if (plan.status === DayPlanStatus.DELIVERED) {
          throw new ConflictException('Der Tag ist bereits als geliefert markiert');
        }
        if (plan.status !== DayPlanStatus.ORDERED) changed = 'ORDERED';
        plan.status = DayPlanStatus.ORDERED;
      } else if (status === 'DELIVERED') {
        if (plan.status !== DayPlanStatus.DELIVERED) changed = 'DELIVERED';
        plan.status = DayPlanStatus.DELIVERED;
      }
      if (note !== undefined) plan.organizerNote = note || null;
      await manager.save(plan);
      return { changed, winnerRestaurantId: plan.winnerRestaurantId, note: plan.organizerNote };
    });

    await this.auditService.log(actorId, 'dayplan.setOrderStatus', 'DayPlan', planId, {
      status: status ?? '(nur Kommentar)',
      note: note ?? null,
    });

    if (result.changed) {
      const winner = result.winnerRestaurantId
        ? await this.restaurantsRepository.findOne({ where: { id: result.winnerRestaurantId } })
        : null;
      const recipients = await this.notificationsService.usersWhoOrdered(planId);
      await this.notificationsService.notifyUsers(
        recipients,
        NotificationType.ORDER_STATUS_CHANGED,
        {
          restaurantName: winner?.name ?? '—',
          status: result.changed,
          note: result.note ?? undefined,
        },
        planId,
      );
    }
  }

  /** Tag absagen. */
  async cancel(planId: string, actorId: string): Promise<void> {
    await this.withLockedPlan(planId, async (plan, manager) => {
      if ([DayPlanStatus.DELIVERED, DayPlanStatus.CANCELLED].includes(plan.status)) {
        throw new ConflictException(`Plan im Status ${plan.status} kann nicht abgesagt werden`);
      }
      plan.status = DayPlanStatus.CANCELLED;
      await manager.save(plan);
      return true;
    });
    await this.auditService.log(actorId, 'dayplan.cancel', 'DayPlan', planId);
    await this.notifyAll(NotificationType.DAY_CANCELLED, planId, {});
  }

  /**
   * Wendet alle fälligen zeitbasierten Übergänge an (Scheduler-Tick und
   * Catch-up beim Lesen des Tagesplans). Idempotent.
   */
  async catchUp(plan: DayPlan): Promise<void> {
    const settings = await this.settingsService.getSettings();
    const today = todayInZone(settings.timezone);
    const now = new Date();

    try {
      if (plan.status === DayPlanStatus.SCHEDULED && plan.date === today) {
        if (now < plan.voteDeadline) {
          await this.openVoting(plan.id, null, false);
        } else {
          // Frist verpasst (z. B. Ausfall): niemand konnte abstimmen → absagen.
          await this.withLockedPlan(plan.id, async (lockedPlan, manager) => {
            if (lockedPlan.status !== DayPlanStatus.SCHEDULED) return null;
            lockedPlan.status = DayPlanStatus.CANCELLED;
            await manager.save(lockedPlan);
            return true;
          });
          await this.auditService.log(null, 'dayplan.autoExpire', 'DayPlan', plan.id, {
            reason: 'Abstimmungsfrist verstrichen, bevor die Abstimmung geöffnet wurde',
          });
        }
      } else if (plan.status === DayPlanStatus.VOTING_OPEN && now >= plan.voteDeadline) {
        await this.closeVoting(plan.id, null, false);
      } else if (
        plan.status === DayPlanStatus.RUNOFF_VOTING &&
        plan.runoffDeadline &&
        now >= plan.runoffDeadline
      ) {
        await this.closeRunoff(plan.id, null, false);
      } else if (plan.status === DayPlanStatus.ORDERING_OPEN && now >= plan.orderDeadline) {
        await this.closeOrdering(plan.id, null, false);
      } else {
        return; // nichts fällig
      }
    } catch (error) {
      this.logger.error(`catchUp für Plan ${plan.id} fehlgeschlagen: ${String(error)}`);
      return;
    }

    // Nach einem Übergang erneut prüfen (z. B. VOTING_OPEN → sofort Frist um).
    const fresh = await this.dayPlansRepository.findOne({ where: { id: plan.id } });
    if (fresh && fresh.status !== plan.status) {
      await this.catchUp(fresh);
    }
  }

  // ---------- intern ----------

  private async withLockedPlan<T>(
    planId: string,
    fn: (plan: DayPlan, manager: EntityManager) => Promise<T | null>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await manager.findOne(DayPlan, {
        where: { id: planId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new NotFoundException('Tagesplan nicht gefunden');
      return (await fn(plan, manager)) as T;
    });
  }

  private async announceWinner(planId: string, restaurantId: string, timezone: string) {
    const [winner, plan] = await Promise.all([
      this.restaurantsRepository.findOne({ where: { id: restaurantId } }),
      this.dayPlansRepository.findOne({ where: { id: planId } }),
    ]);
    await this.notifyAll(NotificationType.WINNER_ANNOUNCED, planId, {
      restaurantName: winner?.name ?? '—',
      deadlineTime: plan ? formatTimeInZone(plan.orderDeadline, timezone) : '',
    });
  }

  private async notifyAll(
    type: NotificationType,
    planId: string,
    params: Record<string, string | number | undefined>,
  ) {
    const users = await this.notificationsService.activeUsers();
    await this.notificationsService.notifyUsers(users, type, params, planId);
  }
}
