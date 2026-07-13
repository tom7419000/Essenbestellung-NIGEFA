import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from '../../database/entities/menu-item.entity';
import { Restaurant } from '../../database/entities/restaurant.entity';

interface ImportedItem {
  name: string;
  description?: string;
  price: number;
  category?: string;
}

/**
 * Adapter für den Import von Speisekarten über eine Lieferdienst-API.
 * Aktuell implementiert: generisches JSON-Format { items: [{ name, price, ... }] }.
 * Weitere Provider (z. B. Lieferando) können als zusätzliche parse-Methoden ergänzt werden.
 */
@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

  constructor(
    @InjectRepository(MenuItem) private readonly menuItemsRepository: Repository<MenuItem>,
  ) {}

  async importFromUrl(
    restaurant: Restaurant,
    url: string,
  ): Promise<{ imported: number; updated: number }> {
    let payload: unknown;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      payload = await response.json();
    } catch (error) {
      this.logger.warn(`Menü-Import fehlgeschlagen (${url}): ${String(error)}`);
      throw new BadRequestException(`Menü konnte nicht geladen werden: ${String(error)}`);
    }

    const items = this.parseGenericJson(payload);
    if (items.length === 0) {
      throw new BadRequestException('Die Quelle enthält keine gültigen Gerichte (items[])');
    }

    let imported = 0;
    let updated = 0;
    for (const item of items) {
      const existing = await this.menuItemsRepository.findOne({
        where: { restaurantId: restaurant.id, name: item.name },
      });
      if (existing) {
        existing.price = item.price;
        existing.description = item.description ?? existing.description;
        existing.category = item.category ?? existing.category;
        existing.isAvailable = true;
        await this.menuItemsRepository.save(existing);
        updated += 1;
      } else {
        await this.menuItemsRepository.save(
          this.menuItemsRepository.create({
            restaurantId: restaurant.id,
            name: item.name,
            description: item.description ?? null,
            price: item.price,
            category: item.category ?? null,
            isAvailable: true,
          }),
        );
        imported += 1;
      }
    }
    return { imported, updated };
  }

  private parseGenericJson(payload: unknown): ImportedItem[] {
    if (!payload || typeof payload !== 'object') return [];
    const raw = (payload as { items?: unknown }).items;
    if (!Array.isArray(raw)) return [];
    const items: ImportedItem[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Record<string, unknown>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const price =
        typeof candidate.price === 'number'
          ? candidate.price
          : parseFloat(String(candidate.price));
      if (!name || name.length > 200 || !Number.isFinite(price) || price < 0) continue;
      items.push({
        name,
        description:
          typeof candidate.description === 'string' ? candidate.description.slice(0, 2000) : undefined,
        price: Math.round(price * 100) / 100,
        category: typeof candidate.category === 'string' ? candidate.category.slice(0, 100) : undefined,
      });
    }
    return items;
  }
}
