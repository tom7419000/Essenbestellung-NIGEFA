import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addDays, todayInZone } from '../../common/utils/time.util';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { DayPlanStatus } from '../../database/entities/enums';
import { Order } from '../../database/entities/order.entity';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { SettingsService } from '../settings/settings.service';

const COMPLETED_STATUSES = [
  DayPlanStatus.ORDERING_CLOSED,
  DayPlanStatus.ORDERED,
  DayPlanStatus.DELIVERED,
];

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(DayPlan) private readonly dayPlansRepository: Repository<DayPlan>,
    @InjectRepository(RestaurantVote)
    private readonly votesRepository: Repository<RestaurantVote>,
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    private readonly settingsService: SettingsService,
  ) {}

  async dashboard(days: number) {
    const settings = await this.settingsService.getSettings();
    const today = todayInZone(settings.timezone);
    const fromDate = addDays(today, -days);

    const totalUsers = await this.usersRepository.count({ where: { isAnonymized: false } });
    const activeUsers = await this.usersRepository.count({
      where: { isActive: true, isAnonymized: false },
    });

    const todayPlan = await this.dayPlansRepository.findOne({ where: { date: today } });
    let votesToday = 0;
    let ordersToday = 0;
    if (todayPlan) {
      votesToday = await this.votesRepository.count({
        where: { dayPlanId: todayPlan.id, isRunoffVote: false },
      });
      const row = await this.ordersRepository
        .createQueryBuilder('order')
        .select('COUNT(DISTINCT order.user_id)', 'count')
        .where('order.day_plan_id = :planId', { planId: todayPlan.id })
        .getRawOne<{ count: string }>();
      ordersToday = parseInt(row?.count ?? '0', 10);
    }

    // Teilnehmerquote: Ø (Besteller / aktive Benutzer) über abgeschlossene Tage im Zeitraum
    const participationRows = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.dayPlan', 'plan')
      .select('plan.id', 'planId')
      .addSelect('COUNT(DISTINCT order.user_id)', 'participants')
      .where('plan.date >= :fromDate AND plan.date <= :today', { fromDate, today })
      .andWhere('plan.status IN (:...statuses)', { statuses: COMPLETED_STATUSES })
      .groupBy('plan.id')
      .getRawMany<{ planId: string; participants: string }>();
    const participationRate =
      participationRows.length > 0 && activeUsers > 0
        ? participationRows.reduce(
            (sum, row) => sum + parseInt(row.participants, 10) / activeUsers,
            0,
          ) / participationRows.length
        : 0;

    // Beliebteste Restaurants: Siege + erhaltene Stimmen im Zeitraum
    const winRows = await this.dayPlansRepository
      .createQueryBuilder('plan')
      .innerJoin('plan.winnerRestaurant', 'restaurant')
      .select('restaurant.id', 'restaurantId')
      .addSelect('restaurant.name', 'name')
      .addSelect('COUNT(*)', 'wins')
      .where('plan.date >= :fromDate AND plan.date <= :today', { fromDate, today })
      .andWhere('plan.winner_restaurant_id IS NOT NULL')
      .groupBy('restaurant.id')
      .addGroupBy('restaurant.name')
      .orderBy('wins', 'DESC')
      .limit(5)
      .getRawMany<{ restaurantId: string; name: string; wins: string }>();

    const voteRows = await this.votesRepository
      .createQueryBuilder('vote')
      .innerJoin('vote.dayPlan', 'plan')
      .select('vote.restaurant_id', 'restaurantId')
      .addSelect('COUNT(*)', 'votes')
      .where('plan.date >= :fromDate AND plan.date <= :today', { fromDate, today })
      .andWhere('vote.is_runoff_vote = false')
      .groupBy('vote.restaurant_id')
      .getRawMany<{ restaurantId: string; votes: string }>();
    const votesByRestaurant = new Map(
      voteRows.map((row) => [row.restaurantId, parseInt(row.votes, 10)]),
    );

    const topRestaurants = winRows.map((row) => ({
      restaurantId: row.restaurantId,
      name: row.name,
      wins: parseInt(row.wins, 10),
      votes: votesByRestaurant.get(row.restaurantId) ?? 0,
    }));

    // Meistbestellte Gerichte
    const itemRows = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.dayPlan', 'plan')
      .innerJoin('order.menuItem', 'item')
      .innerJoin('item.restaurant', 'restaurant')
      .select('item.name', 'name')
      .addSelect('restaurant.name', 'restaurantName')
      .addSelect('SUM(order.quantity)', 'totalQuantity')
      .where('plan.date >= :fromDate AND plan.date <= :today', { fromDate, today })
      .groupBy('item.name')
      .addGroupBy('restaurant.name')
      .orderBy('SUM(order.quantity)', 'DESC')
      .limit(5)
      .getRawMany<{ name: string; restaurantName: string; totalQuantity: string }>();
    const topMenuItems = itemRows.map((row) => ({
      name: row.name,
      restaurantName: row.restaurantName,
      totalQuantity: parseInt(row.totalQuantity, 10),
    }));

    // Verlauf pro Tag
    const perDayRows = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.dayPlan', 'plan')
      .select('plan.date', 'date')
      .addSelect('COUNT(DISTINCT order.user_id)', 'participants')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('SUM(order.quantity * order.price_at_order)', 'total')
      .where('plan.date >= :fromDate AND plan.date <= :today', { fromDate, today })
      .groupBy('plan.date')
      .orderBy('plan.date', 'ASC')
      .getRawMany<{ date: string; participants: string; orders: string; total: string }>();
    const ordersPerDay = perDayRows.map((row) => ({
      date: typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().slice(0, 10),
      participants: parseInt(row.participants, 10),
      orders: parseInt(row.orders, 10),
      total: Math.round(parseFloat(row.total ?? '0') * 100) / 100,
    }));

    const totalSpend = Math.round(ordersPerDay.reduce((sum, day) => sum + day.total, 0) * 100) / 100;

    return {
      totalUsers,
      activeUsers,
      participationRate: Math.round(participationRate * 1000) / 1000,
      votesToday,
      ordersToday,
      topRestaurants,
      topMenuItems,
      ordersPerDay,
      totalSpend,
    };
  }

  async me(userId: string) {
    const base = this.ordersRepository
      .createQueryBuilder('order')
      .where('order.user_id = :userId', { userId });

    const daysRow = await base
      .clone()
      .select('COUNT(DISTINCT order.day_plan_id)', 'days')
      .getRawOne<{ days: string }>();
    const totalsRow = await base
      .clone()
      .select('COALESCE(SUM(order.quantity), 0)', 'items')
      .addSelect('COALESCE(SUM(order.quantity * order.price_at_order), 0)', 'spend')
      .getRawOne<{ items: string; spend: string }>();

    const favoriteRestaurantRow = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.menuItem', 'item')
      .innerJoin('item.restaurant', 'restaurant')
      .select('restaurant.name', 'name')
      .addSelect('SUM(order.quantity)', 'quantity')
      .where('order.user_id = :userId', { userId })
      .groupBy('restaurant.name')
      .orderBy('SUM(order.quantity)', 'DESC')
      .limit(1)
      .getRawOne<{ name: string }>();

    const favoriteItemRow = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.menuItem', 'item')
      .select('item.name', 'name')
      .addSelect('SUM(order.quantity)', 'quantity')
      .where('order.user_id = :userId', { userId })
      .groupBy('item.name')
      .orderBy('SUM(order.quantity)', 'DESC')
      .limit(1)
      .getRawOne<{ name: string }>();

    return {
      daysParticipated: parseInt(daysRow?.days ?? '0', 10),
      totalItems: parseInt(totalsRow?.items ?? '0', 10),
      totalSpend: Math.round(parseFloat(totalsRow?.spend ?? '0') * 100) / 100,
      favoriteRestaurant: favoriteRestaurantRow?.name ?? null,
      favoriteMenuItem: favoriteItemRow?.name ?? null,
    };
  }
}
