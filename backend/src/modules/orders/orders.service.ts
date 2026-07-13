import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { DayPlan } from '../../database/entities/day-plan.entity';
import { DayPlanStatus } from '../../database/entities/enums';
import { MenuItem } from '../../database/entities/menu-item.entity';
import { Order } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { OrderItemDto } from './dto/order.dto';
import { mergeOrderItems } from './order-items.util';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    @InjectRepository(DayPlan) private readonly dayPlansRepository: Repository<DayPlan>,
    @InjectRepository(MenuItem) private readonly menuItemsRepository: Repository<MenuItem>,
  ) {}

  async getMyOrders(planId: string, userId: string) {
    const orders = await this.ordersRepository.find({
      where: { dayPlanId: planId, userId },
      relations: { menuItem: true },
      order: { createdAt: 'ASC' },
    });
    return orders.map((order) => this.toView(order));
  }

  /** Ersetzt die eigenen Positionen des Tages komplett (Upsert-Semantik der Phase 2). */
  async replaceMyOrders(planId: string, user: User, rawItems: OrderItemDto[]) {
    const plan = await this.dayPlansRepository.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Tagesplan nicht gefunden');
    if (plan.status !== DayPlanStatus.ORDERING_OPEN) {
      throw new ConflictException('Die Bestellphase ist derzeit nicht geöffnet');
    }
    if (new Date() >= plan.orderDeadline) {
      throw new ConflictException('Die Bestellfrist ist abgelaufen');
    }
    if (!plan.winnerRestaurantId) {
      throw new ConflictException('Es steht noch kein Gewinner-Restaurant fest');
    }

    const items = mergeOrderItems(rawItems);
    let menuItems: MenuItem[] = [];
    if (items.length > 0) {
      menuItems = await this.menuItemsRepository.find({
        where: { id: In(items.map((item) => item.menuItemId)) },
      });
      const byId = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));
      for (const item of items) {
        const menuItem = byId.get(item.menuItemId);
        if (!menuItem) throw new BadRequestException('Mindestens ein Gericht existiert nicht');
        if (menuItem.restaurantId !== plan.winnerRestaurantId) {
          throw new BadRequestException(
            `„${menuItem.name}" gehört nicht zum heutigen Restaurant`,
          );
        }
        if (!menuItem.isAvailable) {
          throw new BadRequestException(`„${menuItem.name}" ist derzeit nicht verfügbar`);
        }
      }
    }

    const menuItemsById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Order, { dayPlanId: planId, userId: user.id });
      if (items.length > 0) {
        await manager.save(
          Order,
          items.map((item) =>
            manager.create(Order, {
              dayPlanId: planId,
              userId: user.id,
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              note: item.note?.trim() || null,
              priceAtOrder: (menuItemsById.get(item.menuItemId) as MenuItem).price,
            }),
          ),
        );
      }
    });

    return this.getMyOrders(planId, user.id);
  }

  /** Persönliche Historie, gruppiert nach Tag (neueste zuerst), paginiert über Tage. */
  async history(userId: string, page: number, limit: number) {
    const dayRows = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.dayPlan', 'plan')
      .select('plan.id', 'planId')
      .addSelect('plan.date', 'date')
      .groupBy('plan.id')
      .addGroupBy('plan.date')
      .where('order.user_id = :userId', { userId })
      .orderBy('plan.date', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ planId: string; date: string }>();

    const totalRow = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.day_plan_id)', 'count')
      .where('order.user_id = :userId', { userId })
      .getRawOne<{ count: string }>();
    const total = parseInt(totalRow?.count ?? '0', 10);

    if (dayRows.length === 0) return { items: [], total, page, limit };

    const orders = await this.ordersRepository.find({
      where: { userId, dayPlanId: In(dayRows.map((row) => row.planId)) },
      relations: { menuItem: true, dayPlan: { winnerRestaurant: true } },
      order: { createdAt: 'ASC' },
    });

    const items = dayRows.map((row) => {
      const dayOrders = orders.filter((order) => order.dayPlanId === row.planId);
      const plan = dayOrders[0]?.dayPlan;
      const lines = dayOrders.map((order) => ({
        name: order.menuItem.name,
        quantity: order.quantity,
        note: order.note,
        priceAtOrder: order.priceAtOrder,
      }));
      const total = lines.reduce(
        (sum, line) => sum + line.priceAtOrder * line.quantity,
        0,
      );
      return {
        dayPlanId: row.planId,
        date: plan?.date ?? row.date,
        dayStatus: plan?.status ?? null,
        restaurantName: plan?.winnerRestaurant?.name ?? '—',
        lines,
        total: Math.round(total * 100) / 100,
      };
    });

    return { items, total, page, limit };
  }

  private toView(order: Order) {
    return {
      id: order.id,
      menuItem: {
        id: order.menuItem.id,
        restaurantId: order.menuItem.restaurantId,
        name: order.menuItem.name,
        description: order.menuItem.description,
        price: order.menuItem.price,
        category: order.menuItem.category,
        isAvailable: order.menuItem.isAvailable,
      },
      quantity: order.quantity,
      note: order.note,
      priceAtOrder: order.priceAtOrder,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
