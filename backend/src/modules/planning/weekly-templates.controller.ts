import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import { UpsertWeeklyTemplateDto } from './dto/day-plan.dto';
import { WeeklyTemplatesService } from './weekly-templates.service';

@ApiTags('weekly-templates')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('weekly-templates')
export class WeeklyTemplatesController {
  constructor(private readonly weeklyTemplatesService: WeeklyTemplatesService) {}

  @Get()
  list() {
    return this.weeklyTemplatesService.list();
  }

  @Put(':weekday')
  upsert(
    @Param('weekday', ParseIntPipe) weekday: number,
    @Body() dto: UpsertWeeklyTemplateDto,
    @CurrentUser() user: User,
  ) {
    return this.weeklyTemplatesService.upsert(weekday, dto, user.id);
  }

  @Delete(':weekday')
  @HttpCode(204)
  async remove(@Param('weekday', ParseIntPipe) weekday: number, @CurrentUser() user: User) {
    await this.weeklyTemplatesService.remove(weekday, user.id);
  }
}
