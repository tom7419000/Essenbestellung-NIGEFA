import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Paginated } from '../../common/dto/pagination.dto';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly auditRepository: Repository<AuditLog>,
  ) {}

  /**
   * Protokolliert eine Admin-/Organisator-Aktion oder Systementscheidung.
   * actorId = null → System/Scheduler. Fehler beim Protokollieren brechen
   * die fachliche Aktion nicht ab.
   */
  async log(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId?: string | null,
    details?: object,
  ): Promise<void> {
    try {
      const entry = this.auditRepository.create({
        actorId,
        action,
        entityType,
        entityId: entityId ?? null,
        details: (details as AuditLog['details']) ?? null,
      });
      await this.auditRepository.save(entry);
    } catch (error) {
      this.logger.error(`Audit-Log fehlgeschlagen (${action}): ${String(error)}`);
    }
  }

  async list(options: {
    page: number;
    limit: number;
    action?: string;
    actorId?: string;
  }): Promise<Paginated<Record<string, unknown>>> {
    const where: FindOptionsWhere<AuditLog> = {};
    if (options.action) where.action = options.action;
    if (options.actorId) where.actorId = options.actorId;

    const [items, total] = await this.auditRepository.findAndCount({
      where,
      relations: { actor: true },
      order: { createdAt: 'DESC' },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });

    return {
      items: items.map((entry) => ({
        id: entry.id,
        actor: entry.actor
          ? {
              id: entry.actor.id,
              firstName: entry.actor.firstName,
              lastName: entry.actor.lastName,
              email: entry.actor.email,
            }
          : null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details,
        createdAt: entry.createdAt,
      })),
      total,
      page: options.page,
      limit: options.limit,
    };
  }
}
