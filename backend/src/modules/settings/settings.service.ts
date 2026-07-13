import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { Repository } from 'typeorm';
import { assignDefined } from '../../common/utils/assign-defined.util';
import { toHHmm } from '../../common/utils/time.util';
import { AppSetting } from '../../database/entities/app-setting.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSetting) private readonly settingsRepository: Repository<AppSetting>,
    private readonly auditService: AuditService,
  ) {}

  /** Liefert die Singleton-Einstellungen; legt sie beim ersten Zugriff an. */
  async getSettings(): Promise<AppSetting> {
    let settings = await this.settingsRepository.findOne({ where: { id: 1 } });
    if (!settings) {
      settings = this.settingsRepository.create({ id: 1 });
      await this.settingsRepository.save(settings);
      settings = (await this.settingsRepository.findOne({ where: { id: 1 } })) as AppSetting;
    }
    return settings;
  }

  async update(dto: Partial<AppSetting>, actorId: string): Promise<AppSetting> {
    if (dto.timezone && !DateTime.now().setZone(dto.timezone).isValid) {
      throw new BadRequestException(`Unbekannte Zeitzone: ${dto.timezone}`);
    }
    const settings = await this.getSettings();
    const before = this.toView(settings);
    assignDefined(settings, dto);
    await this.settingsRepository.save(settings);
    const after = this.toView(settings);
    await this.auditService.log(actorId, 'settings.update', 'AppSetting', '1', {
      before,
      after,
    });
    return settings;
  }

  toView(settings: AppSetting) {
    return {
      voteDeadlineTime: toHHmm(settings.voteDeadlineTime),
      orderDeadlineTime: toHHmm(settings.orderDeadlineTime),
      tieBreakStrategy: settings.tieBreakStrategy,
      runoffMinutes: settings.runoffMinutes,
      reminderLeadMinutes: settings.reminderLeadMinutes,
      timezone: settings.timezone,
      autoGenerateFromTemplate: settings.autoGenerateFromTemplate,
    };
  }
}
