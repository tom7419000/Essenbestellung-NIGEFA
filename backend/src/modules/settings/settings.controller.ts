import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import { UpdateSettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async get() {
    return this.settingsService.toView(await this.settingsService.getSettings());
  }

  @Patch()
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: User) {
    return this.settingsService.toView(await this.settingsService.update(dto, user.id));
  }
}
