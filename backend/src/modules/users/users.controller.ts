import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import {
  ChangePasswordDto,
  CreateUserDto,
  ListUsersDto,
  ResetPasswordDto,
  UpdateMeDto,
  UpdateUserDto,
} from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  list(@Query() query: ListUsersDto) {
    return this.usersService.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      all: query.all === 'true',
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: User) {
    return this.usersService.create(dto, user.id);
  }

  @Patch('me')
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: User) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Patch('me/password')
  @HttpCode(204)
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: User) {
    await this.usersService.changePassword(user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.usersService.update(id, dto, user.id);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: User,
  ) {
    await this.usersService.resetPassword(id, dto.newPassword, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async anonymize(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.usersService.anonymize(id, user.id);
  }
}
