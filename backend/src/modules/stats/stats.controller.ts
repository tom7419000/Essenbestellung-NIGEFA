import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import { StatsService } from './stats.service';

class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days: number = 30;
}

@ApiTags('stats')
@ApiBearerAuth()
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  @Roles(Role.ADMIN)
  dashboard(@Query() query: DashboardQueryDto) {
    return this.statsService.dashboard(query.days);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.statsService.me(user.id);
  }
}
