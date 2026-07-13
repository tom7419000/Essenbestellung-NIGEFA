import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from './notifications.service';

class ListNotificationsDto extends PaginationDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  unreadOnly?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Query() query: ListNotificationsDto, @CurrentUser() user: User) {
    return this.notificationsService.list(
      user.id,
      query.unreadOnly === 'true',
      query.page,
      query.limit,
    );
  }

  @Patch(':id/read')
  @HttpCode(204)
  async markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.notificationsService.markRead(id, user.id);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: User) {
    await this.notificationsService.markAllRead(user.id);
  }
}
