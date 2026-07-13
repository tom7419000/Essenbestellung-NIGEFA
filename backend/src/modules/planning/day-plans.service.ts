import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { addDays, combineDateAndTime, todayInZone, weekdayOf } from '../../common/utils/time.util';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { DayPlanStatus, NotificationType } from '../../database/entities/enums';
import { Order } from '../../database/entities/order.entity';
import { Restaurant } from '../../database/entities/restaurant.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { WeeklyTemplate } from '../../database/entities/weekly-template.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { userRef } from '../users/users.service';
import { CreateDayPlanDto, UpdateDayPlanDto } from './dto/day-plan.dto';

/** Status, in denen die Bestellphase läuft oder abgeschlossen ist (Menü sichtbar). */
export const ORDERING_STATUSES = [
  DayPlanStatus.ORDERING_OPEN,
  DayPlanStatus.ORDERING_CLOSED,
  DayPlanStatus.ORDERED,
  DayPlanStatus.DELIVERED,
];

const EDITABLE_STATUSES = [
  DayPlanStatus.SCHEDULED,
  DayPlanStatus.VOTING_OPEN,
  DayPlanStatus.RUNOFF_VOTING,
  DayPlanStatus.TIE_ADMIN_DECISION,
  DayPlanStatus.ORDERING_OPEN,
];

@Injectable()
export class DayPlansService {
  constructor(
    @InjectRepository(DayPlan) private readonly dayPlansRepository: Repository<DayPlan>,
    @InjectRepository(DayPlanRestaurant)
    private readonly optionsRepository: Repository<DayPlanRestaurant>,
    @InjectRepository(RestaurantVote)
    private readonly votesRepository: Repository<RestaurantVote>,
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    @InjectRepository(Restaurant) private readonly restaurantsRepository: Repository<Restaurant>,
    @InjectRepository(WeeklyTemplate)
    private readonly weeklyTemplatesRepository: Repository<WeeklyTemplate>,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  // ---------- Lesen ----------

  async findByIdOrFail(id: string): Promise<DayPlan> {
    const plan = await this.dayPlansRepository.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Tagesplan nicht gefunden');
    return plan;
  }

  async findToday(): Promise<DayPlan | null> {
    const settings = await this.settingsService.getSettings();
    const today = todayInZone(settings.timezone);
    return this.dayPlansRepository.findOne({ where: { date: today } });
  }

  /** Detailansicht gemäß API-Spezifikation (DayPlanDetail). */
  async buildDetail(planId: string, user: User) {
    const plan = await this.dayPlansRepository.findOne({
      where: { id: planId },
      relations: { organizer: true, options: { restaurant: true } },
    });
    if (!plan) throw new NotFoundException('Tagesplan nicht gefunden');

    const isRunoffRound = plan.status === DayPlanStatus.RUNOFF_VOTING;
    const voteCounts = await this.countVotesByRestaurant(plan.id, isRunoffRound);

    const [myVote, myRunoffVote] = await Promise.all([
      this.votesRepository.findOne({
        where: { dayPlanId: plan.id, userId: user.id, isRunoffVote: false },
      }),
      this.votesRepository.findOne({
        where: { dayPlanId: plan.id, userId: user.id, isRunoffVote: true },
      }),
    ]);

    const myOrders = await this.ordersRepository.find({
      where: { dayPlanId: plan.id, userId: user.id },
      relations: { menuItem: true },
      order: { createdAt: 'ASC' },
    });

    let winnerRestaurant: Record<string, unknown> | null = null;
    if (plan.winnerRestaurantId && ORDERING_STATUSES.includes(plan.status)) {
      const winner = await this.restaurantsRepository.findOne({
        where: { id: plan.winnerRestaurantId },
        relations: { menuItems: true },
      });
      if (winner) {
        winnerRestaurant = {
          id: winner.id,
          name: winner.name,
          description: winner.description,
          cuisine: winner.cuisine,
          phone: winner.phone,
          website: winner.website,
          menuItems: (winner.menuItems ?? [])
            .filter((item) => item.isAvailable)
            .sort(
              (a, b) =>
                (a.category ?? '').localeCompare(b.category ?? '') ||
                a.name.localeCompare(b.name),
            )
            .map((item) => this.menuItemView(item)),
        };
      }
    }

    const totalVotes = [...voteCounts.values()].reduce((sum, count) => sum + count, 0);
    const totalOrders = await this.countDistinctOrderUsers(plan.id);

    return {
      id: plan.id,
      date: plan.date,
      status: plan.status,
      voteDeadline: plan.voteDeadline,
      orderDeadline: plan.orderDeadline,
      runoffDeadline: plan.runoffDeadline,
      tieBreakStrategy: plan.tieBreakStrategy,
      organizer: plan.organizer ? userRef(plan.organizer) : null,
      organizerNote: plan.organizerNote,
      options: (plan.options ?? [])
        .sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name))
        .map((option) => ({
          restaurantId: option.restaurantId,
          name: option.restaurant.name,
          cuisine: option.restaurant.cuisine,
          description: option.restaurant.description,
          voteCount: voteCounts.get(option.restaurantId) ?? 0,
          isRunoffCandidate: option.isRunoffCandidate,
        })),
      winnerRestaurant,
      myVote: myVote ? { restaurantId: myVote.restaurantId } : null,
      myRunoffVote: myRunoffVote ? { restaurantId: myRunoffVote.restaurantId } : null,
      myOrders: myOrders.map((order) => this.orderLineView(order)),
      totalVotes,
      totalOrders,
    };
  }

  async list(from?: string, to?: string) {
    const settings = await this.settingsService.getSettings();
    const today = todayInZone(settings.timezone);
    const fromDate = from ?? addDays(today, -30);
    const toDate = to ?? addDays(today, 7);

    const plans = await this.dayPlansRepository.find({
      where: { date: Between(fromDate, toDate) },
      relations: { organizer: true, winnerRestaurant: true },
      order: { date: 'DESC' },
    });
    if (plans.length === 0) return [];

    const planIds = plans.map((plan) => plan.id);
    const voteCounts = await this.votesRepository
      .createQueryBuilder('vote')
      .select('vote.day_plan_id', 'planId')
      .addSelect('COUNT(*)', 'count')
      .where('vote.day_plan_id IN (:...planIds)', { planIds })
      .andWhere('vote.is_runoff_vote = false')
      .groupBy('vote.day_plan_id')
      .getRawMany<{ planId: string; count: string }>();
    const orderCounts = await this.ordersRepository
      .createQueryBuilder('order')
      .select('order.day_plan_id', 'planId')
      .addSelect('COUNT(DISTINCT order.user_id)', 'count')
      .where('order.day_plan_id IN (:...planIds)', { planIds })
      .groupBy('order.day_plan_id')
      .getRawMany<{ planId: string; count: string }>();

    const votesByPlan = new Map(voteCounts.map((row) => [row.planId, parseInt(row.count, 10)]));
    const ordersByPlan = new Map(orderCounts.map((row) => [row.planId, parseInt(row.count, 10)]));

    return plans.map((plan) => ({
      id: plan.id,
      date: plan.date,
      status: plan.status,
      voteDeadline: plan.voteDeadline,
      orderDeadline: plan.orderDeadline,
      organizer: plan.organizer ? userRef(plan.organizer) : null,
      winnerRestaurant: plan.winnerRestaurant
        ? { id: plan.winnerRestaurant.id, name: plan.winnerRestaurant.name }
        : null,
      totalVotes: votesByPlan.get(plan.id) ?? 0,
      totalOrders: ordersByPlan.get(plan.id) ?? 0,
    }));
  }

  // ---------- Anlegen / Ändern ----------

  async create(dto: CreateDayPlanDto, actorId: string | null) {
    const settings = await this.settingsService.getSettings();
    const today = todayInZone(settings.timezone);
    if (dto.date < today) {
      throw new BadRequestException('Tagespläne können nicht in der Vergangenheit angelegt werden');
    }
    const existing = await this.dayPlansRepository.findOne({ where: { date: dto.date } });
    if (existing) throw new ConflictException(`Für ${dto.date} existiert bereits ein Plan`);

    const restaurants = await this.loadActiveRestaurants(dto.restaurantIds);

    const voteTime = dto.voteDeadlineTime ?? settings.voteDeadlineTime;
    const orderTime = dto.orderDeadlineTime ?? settings.orderDeadlineTime;
    const voteDeadline = combineDateAndTime(dto.date, voteTime, settings.timezone);
    const orderDeadline = combineDateAndTime(dto.date, orderTime, settings.timezone);
    if (orderDeadline <= voteDeadline) {
      throw new BadRequestException('Die Bestellfrist muss nach der Abstimmungsfrist liegen');
    }

    const now = new Date();
    const isToday = dto.date === today;
    if (isToday && voteDeadline <= now) {
      throw new BadRequestException(
        'Die Abstimmungsfrist liegt bereits in der Vergangenheit — bitte spätere Uhrzeit wählen',
      );
    }

    const plan = this.dayPlansRepository.create({
      date: dto.date,
      status: isToday ? DayPlanStatus.VOTING_OPEN : DayPlanStatus.SCHEDULED,
      voteDeadline,
      orderDeadline,
      tieBreakStrategy: dto.tieBreakStrategy ?? settings.tieBreakStrategy,
      organizerId: dto.organizerId ?? null,
    });
    await this.dayPlansRepository.save(plan);
    await this.optionsRepository.save(
      restaurants.map((restaurant) =>
        this.optionsRepository.create({ dayPlanId: plan.id, restaurantId: restaurant.id }),
      ),
    );

    await this.auditService.log(actorId, 'dayplan.create', 'DayPlan', plan.id, {
      date: plan.date,
      restaurantIds: dto.restaurantIds,
      voteDeadline: plan.voteDeadline.toISOString(),
      orderDeadline: plan.orderDeadline.toISOString(),
    });

    if (plan.status === DayPlanStatus.VOTING_OPEN) {
      const users = await this.notificationsService.activeUsers();
      await this.notificationsService.notifyUsers(
        users,
        NotificationType.VOTING_OPENED,
        { deadlineTime: voteTime.slice(0, 5) },
        plan.id,
      );
    }
    return plan;
  }

  async update(id: string, dto: UpdateDayPlanDto, actorId: string) {
    const plan = await this.findByIdOrFail(id);
    if (!EDITABLE_STATUSES.includes(plan.status)) {
      throw new ConflictException(`Plan im Status ${plan.status} kann nicht bearbeitet werden`);
    }
    const settings = await this.settingsService.getSettings();

    if (dto.restaurantIds) {
      if (plan.winnerRestaurantId && !dto.restaurantIds.includes(plan.winnerRestaurantId)) {
        throw new BadRequestException('Das Gewinner-Restaurant kann nicht entfernt werden');
      }
      const restaurants = await this.loadActiveRestaurants(dto.restaurantIds);
      const currentOptions = await this.optionsRepository.find({ where: { dayPlanId: plan.id } });
      const keepIds = new Set(restaurants.map((restaurant) => restaurant.id));
      const removed = currentOptions.filter((option) => !keepIds.has(option.restaurantId));
      const existingIds = new Set(currentOptions.map((option) => option.restaurantId));

      if (removed.length > 0) {
        await this.votesRepository.delete({
          dayPlanId: plan.id,
          restaurantId: In(removed.map((option) => option.restaurantId)),
        });
        await this.optionsRepository.remove(removed);
      }
      const toAdd = restaurants.filter((restaurant) => !existingIds.has(restaurant.id));
      if (toAdd.length > 0) {
        await this.optionsRepository.save(
          toAdd.map((restaurant) =>
            this.optionsRepository.create({ dayPlanId: plan.id, restaurantId: restaurant.id }),
          ),
        );
      }
    }

    if (dto.organizerId !== undefined) plan.organizerId = dto.organizerId;
    if (dto.tieBreakStrategy) plan.tieBreakStrategy = dto.tieBreakStrategy;
    if (dto.voteDeadlineTime) {
      plan.voteDeadline = combineDateAndTime(plan.date, dto.voteDeadlineTime, settings.timezone);
    }
    if (dto.orderDeadlineTime) {
      plan.orderDeadline = combineDateAndTime(plan.date, dto.orderDeadlineTime, settings.timezone);
    }
    if (plan.orderDeadline <= plan.voteDeadline) {
      throw new BadRequestException('Die Bestellfrist muss nach der Abstimmungsfrist liegen');
    }

    await this.dayPlansRepository.save(plan);
    await this.auditService.log(actorId, 'dayplan.update', 'DayPlan', plan.id, {
      changes: { ...dto },
    });
    return plan;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const plan = await this.findByIdOrFail(id);
    if (![DayPlanStatus.SCHEDULED, DayPlanStatus.CANCELLED].includes(plan.status)) {
      throw new ConflictException('Nur geplante oder stornierte Tage können gelöscht werden');
    }
    await this.dayPlansRepository.remove(plan);
    await this.auditService.log(actorId, 'dayplan.delete', 'DayPlan', id, { date: plan.date });
  }

  /**
   * Erzeugt den Tagesplan aus der Wochenvorlage (Admin-Aktion oder Scheduler).
   * Gibt null zurück, wenn keine (aktive) Vorlage existiert.
   */
  async generateFromTemplate(date: string, actorId: string | null): Promise<DayPlan | null> {
    const existing = await this.dayPlansRepository.findOne({ where: { date } });
    if (existing) {
      if (actorId) throw new ConflictException(`Für ${date} existiert bereits ein Plan`);
      return existing;
    }

    const template = await this.weeklyTemplatesRepository.findOne({
      where: { weekday: weekdayOf(date) },
      relations: { restaurants: true },
    });
    if (!template || !template.isActive || (template.restaurants ?? []).length === 0) {
      if (actorId) {
        throw new BadRequestException('Für diesen Wochentag existiert keine aktive Wochenvorlage');
      }
      return null;
    }

    const settings = await this.settingsService.getSettings();
    const restaurantIds = template.restaurants.map((entry) => entry.restaurantId);
    const activeRestaurants = await this.restaurantsRepository.find({
      where: { id: In(restaurantIds), isActive: true },
    });
    if (activeRestaurants.length === 0) {
      if (actorId) throw new BadRequestException('Die Vorlage enthält keine aktiven Restaurants');
      return null;
    }

    const voteDeadline = combineDateAndTime(date, template.voteDeadlineTime, settings.timezone);
    const orderDeadline = combineDateAndTime(date, template.orderDeadlineTime, settings.timezone);
    const today = todayInZone(settings.timezone);
    const now = new Date();
    // Aus Vorlage erzeugte Pläne starten SCHEDULED; der Scheduler öffnet die
    // Abstimmung am Plantag (bzw. sofort beim nächsten Tick, wenn heute).
    const plan = this.dayPlansRepository.create({
      date,
      status: DayPlanStatus.SCHEDULED,
      voteDeadline,
      orderDeadline,
      tieBreakStrategy: template.tieBreakStrategy ?? settings.tieBreakStrategy,
      organizerId: template.organizerId,
    });
    // Manuell erzeugter Plan für heute mit bereits abgelaufener Frist ist sinnlos.
    if (actorId && date === today && voteDeadline <= now) {
      throw new BadRequestException(
        'Die Abstimmungsfrist der Vorlage ist heute bereits abgelaufen',
      );
    }
    await this.dayPlansRepository.save(plan);
    await this.optionsRepository.save(
      activeRestaurants.map((restaurant) =>
        this.optionsRepository.create({ dayPlanId: plan.id, restaurantId: restaurant.id }),
      ),
    );
    await this.auditService.log(actorId, 'dayplan.generateFromTemplate', 'DayPlan', plan.id, {
      date,
      weekday: template.weekday,
    });
    return plan;
  }

  // ---------- Zusammenfassung (Organisator) ----------

  async summary(planId: string) {
    const plan = await this.dayPlansRepository.findOne({
      where: { id: planId },
      relations: { organizer: true, winnerRestaurant: true },
    });
    if (!plan) throw new NotFoundException('Tagesplan nicht gefunden');

    const orders = await this.ordersRepository.find({
      where: { dayPlanId: planId },
      relations: { menuItem: true, user: true },
      order: { createdAt: 'ASC' },
    });

    const byMenuItemMap = new Map<
      string,
      {
        menuItemId: string;
        name: string;
        price: number;
        totalQuantity: number;
        orders: { user: ReturnType<typeof userRef>; quantity: number; note: string | null }[];
      }
    >();
    const byUserMap = new Map<
      string,
      {
        user: ReturnType<typeof userRef>;
        lines: {
          name: string;
          quantity: number;
          note: string | null;
          priceAtOrder: number;
          lineTotal: number;
        }[];
        userTotal: number;
      }
    >();
    let grandTotal = 0;

    for (const order of orders) {
      const lineTotal = Math.round(order.priceAtOrder * order.quantity * 100) / 100;
      grandTotal += lineTotal;

      const itemEntry = byMenuItemMap.get(order.menuItemId) ?? {
        menuItemId: order.menuItemId,
        name: order.menuItem.name,
        price: order.priceAtOrder,
        totalQuantity: 0,
        orders: [],
      };
      itemEntry.totalQuantity += order.quantity;
      itemEntry.orders.push({
        user: userRef(order.user),
        quantity: order.quantity,
        note: order.note,
      });
      byMenuItemMap.set(order.menuItemId, itemEntry);

      const userEntry = byUserMap.get(order.userId) ?? {
        user: userRef(order.user),
        lines: [],
        userTotal: 0,
      };
      userEntry.lines.push({
        name: order.menuItem.name,
        quantity: order.quantity,
        note: order.note,
        priceAtOrder: order.priceAtOrder,
        lineTotal,
      });
      userEntry.userTotal = Math.round((userEntry.userTotal + lineTotal) * 100) / 100;
      byUserMap.set(order.userId, userEntry);
    }

    return {
      dayPlan: {
        id: plan.id,
        date: plan.date,
        status: plan.status,
        voteDeadline: plan.voteDeadline,
        orderDeadline: plan.orderDeadline,
        organizer: plan.organizer ? userRef(plan.organizer) : null,
        organizerNote: plan.organizerNote,
        winnerRestaurant: plan.winnerRestaurant
          ? {
              id: plan.winnerRestaurant.id,
              name: plan.winnerRestaurant.name,
              phone: plan.winnerRestaurant.phone,
              website: plan.winnerRestaurant.website,
            }
          : null,
      },
      byMenuItem: [...byMenuItemMap.values()].sort((a, b) => b.totalQuantity - a.totalQuantity),
      byUser: [...byUserMap.values()].sort((a, b) =>
        a.user.firstName.localeCompare(b.user.firstName),
      ),
      participantCount: byUserMap.size,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }

  async listVotes(planId: string) {
    await this.findByIdOrFail(planId);
    const votes = await this.votesRepository.find({
      where: { dayPlanId: planId },
      relations: { user: true, restaurant: true },
      order: { createdAt: 'ASC' },
    });
    return votes.map((vote) => ({
      user: userRef(vote.user),
      restaurant: { id: vote.restaurant.id, name: vote.restaurant.name },
      isRunoffVote: vote.isRunoffVote,
      createdAt: vote.createdAt,
    }));
  }

  // ---------- Helfer ----------

  async countVotesByRestaurant(planId: string, isRunoff: boolean): Promise<Map<string, number>> {
    const rows = await this.votesRepository
      .createQueryBuilder('vote')
      .select('vote.restaurant_id', 'restaurantId')
      .addSelect('COUNT(*)', 'count')
      .where('vote.day_plan_id = :planId', { planId })
      .andWhere('vote.is_runoff_vote = :isRunoff', { isRunoff })
      .groupBy('vote.restaurant_id')
      .getRawMany<{ restaurantId: string; count: string }>();
    return new Map(rows.map((row) => [row.restaurantId, parseInt(row.count, 10)]));
  }

  async countDistinctOrderUsers(planId: string): Promise<number> {
    const row = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.user_id)', 'count')
      .where('order.day_plan_id = :planId', { planId })
      .getRawOne<{ count: string }>();
    return parseInt(row?.count ?? '0', 10);
  }

  private async loadActiveRestaurants(ids: string[]): Promise<Restaurant[]> {
    const unique = [...new Set(ids)];
    const restaurants = await this.restaurantsRepository.find({
      where: { id: In(unique), isActive: true },
    });
    if (restaurants.length !== unique.length) {
      throw new BadRequestException('Mindestens ein Restaurant existiert nicht oder ist inaktiv');
    }
    return restaurants;
  }

  private menuItemView(item: {
    id: string;
    restaurantId: string;
    name: string;
    description: string | null;
    price: number;
    category: string | null;
    isAvailable: boolean;
  }) {
    return {
      id: item.id,
      restaurantId: item.restaurantId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      isAvailable: item.isAvailable,
    };
  }

  private orderLineView(order: {
    id: string;
    menuItem: {
      id: string;
      restaurantId: string;
      name: string;
      description: string | null;
      price: number;
      category: string | null;
      isAvailable: boolean;
    };
    quantity: number;
    note: string | null;
    priceAtOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: order.id,
      menuItem: this.menuItemView(order.menuItem),
      quantity: order.quantity,
      note: order.note,
      priceAtOrder: order.priceAtOrder,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
