import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assignDefined } from '../../common/utils/assign-defined.util';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { MenuItem } from '../../database/entities/menu-item.entity';
import { Order } from '../../database/entities/order.entity';
import { Restaurant } from '../../database/entities/restaurant.entity';
import { AuditService } from '../audit/audit.service';
import {
  CreateMenuItemDto,
  CreateRestaurantDto,
  UpdateMenuItemDto,
  UpdateRestaurantDto,
} from './dto/restaurant.dto';
import { MenuImportService } from './menu-import.service';

@Injectable()
export class RestaurantsService {
  constructor(
    @InjectRepository(Restaurant) private readonly restaurantsRepository: Repository<Restaurant>,
    @InjectRepository(MenuItem) private readonly menuItemsRepository: Repository<MenuItem>,
    @InjectRepository(DayPlanRestaurant)
    private readonly dayPlanRestaurantsRepository: Repository<DayPlanRestaurant>,
    @InjectRepository(Order) private readonly ordersRepository: Repository<Order>,
    private readonly menuImportService: MenuImportService,
    private readonly auditService: AuditService,
  ) {}

  list(includeInactive: boolean): Promise<Restaurant[]> {
    return this.restaurantsRepository.find({
      where: includeInactive ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findById(id: string, withMenu = false): Promise<Restaurant> {
    const restaurant = await this.restaurantsRepository.findOne({
      where: { id },
      relations: withMenu ? { menuItems: true } : undefined,
      order: withMenu ? { menuItems: { category: 'ASC', name: 'ASC' } } : undefined,
    });
    if (!restaurant) throw new NotFoundException('Restaurant nicht gefunden');
    return restaurant;
  }

  async create(dto: CreateRestaurantDto, actorId: string): Promise<Restaurant> {
    const restaurant = this.restaurantsRepository.create({ ...dto });
    await this.restaurantsRepository.save(restaurant);
    await this.auditService.log(actorId, 'restaurant.create', 'Restaurant', restaurant.id, {
      name: restaurant.name,
    });
    return restaurant;
  }

  async update(id: string, dto: UpdateRestaurantDto, actorId: string): Promise<Restaurant> {
    const restaurant = await this.findById(id);
    assignDefined(restaurant, dto);
    await this.restaurantsRepository.save(restaurant);
    await this.auditService.log(actorId, 'restaurant.update', 'Restaurant', restaurant.id, {
      changes: { ...dto },
    });
    return restaurant;
  }

  /** Bereits verwendete Restaurants werden nur deaktiviert (Historie bleibt konsistent). */
  async remove(id: string, actorId: string): Promise<{ deactivated: boolean }> {
    const restaurant = await this.findById(id);
    const used = await this.dayPlanRestaurantsRepository.count({ where: { restaurantId: id } });
    if (used > 0) {
      restaurant.isActive = false;
      await this.restaurantsRepository.save(restaurant);
      await this.auditService.log(actorId, 'restaurant.deactivate', 'Restaurant', id, {
        name: restaurant.name,
      });
      return { deactivated: true };
    }
    await this.restaurantsRepository.remove(restaurant);
    await this.auditService.log(actorId, 'restaurant.delete', 'Restaurant', id, {
      name: restaurant.name,
    });
    return { deactivated: false };
  }

  async addMenuItem(restaurantId: string, dto: CreateMenuItemDto, actorId: string): Promise<MenuItem> {
    await this.findById(restaurantId);
    const item = this.menuItemsRepository.create({ ...dto, restaurantId });
    await this.menuItemsRepository.save(item);
    await this.auditService.log(actorId, 'menuItem.create', 'MenuItem', item.id, {
      restaurantId,
      name: item.name,
      price: item.price,
    });
    return item;
  }

  async updateMenuItem(
    restaurantId: string,
    itemId: string,
    dto: UpdateMenuItemDto,
    actorId: string,
  ): Promise<MenuItem> {
    const item = await this.menuItemsRepository.findOne({
      where: { id: itemId, restaurantId },
    });
    if (!item) throw new NotFoundException('Gericht nicht gefunden');
    assignDefined(item, dto);
    await this.menuItemsRepository.save(item);
    await this.auditService.log(actorId, 'menuItem.update', 'MenuItem', item.id, {
      changes: { ...dto },
    });
    return item;
  }

  /** Bereits bestellte Gerichte werden nur auf „nicht verfügbar" gesetzt. */
  async removeMenuItem(
    restaurantId: string,
    itemId: string,
    actorId: string,
  ): Promise<{ deactivated: boolean }> {
    const item = await this.menuItemsRepository.findOne({ where: { id: itemId, restaurantId } });
    if (!item) throw new NotFoundException('Gericht nicht gefunden');
    const ordered = await this.ordersRepository.count({ where: { menuItemId: itemId } });
    if (ordered > 0) {
      item.isAvailable = false;
      await this.menuItemsRepository.save(item);
      await this.auditService.log(actorId, 'menuItem.deactivate', 'MenuItem', itemId);
      return { deactivated: true };
    }
    await this.menuItemsRepository.remove(item);
    await this.auditService.log(actorId, 'menuItem.delete', 'MenuItem', itemId);
    return { deactivated: false };
  }

  async importMenu(
    restaurantId: string,
    url: string | undefined,
    actorId: string,
  ): Promise<{ imported: number; updated: number }> {
    const restaurant = await this.findById(restaurantId);
    const sourceUrl = url ?? restaurant.menuUrl;
    if (!sourceUrl) {
      throw new BadRequestException('Keine Menü-URL hinterlegt — url im Body oder menuUrl am Restaurant setzen');
    }
    const result = await this.menuImportService.importFromUrl(restaurant, sourceUrl);
    await this.auditService.log(actorId, 'restaurant.importMenu', 'Restaurant', restaurantId, {
      url: sourceUrl,
      ...result,
    });
    return result;
  }
}
