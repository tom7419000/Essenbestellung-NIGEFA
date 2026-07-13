import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import {
  CreateMenuItemDto,
  CreateRestaurantDto,
  ImportMenuDto,
  UpdateMenuItemDto,
  UpdateRestaurantDto,
} from './dto/restaurant.dto';
import { RestaurantsService } from './restaurants.service';

@ApiTags('restaurants')
@ApiBearerAuth()
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get()
  list(@Query('includeInactive') includeInactive: string, @CurrentUser() user: User) {
    const withInactive = includeInactive === 'true' && user.role === Role.ADMIN;
    return this.restaurantsService.list(withInactive);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.restaurantsService.findById(id, true);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateRestaurantDto, @CurrentUser() user: User) {
    return this.restaurantsService.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRestaurantDto,
    @CurrentUser() user: User,
  ) {
    return this.restaurantsService.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.restaurantsService.remove(id, user.id);
  }

  @Post(':id/menu-items')
  @Roles(Role.ADMIN)
  addMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMenuItemDto,
    @CurrentUser() user: User,
  ) {
    return this.restaurantsService.addMenuItem(id, dto, user.id);
  }

  @Patch(':id/menu-items/:itemId')
  @Roles(Role.ADMIN)
  updateMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateMenuItemDto,
    @CurrentUser() user: User,
  ) {
    return this.restaurantsService.updateMenuItem(id, itemId, dto, user.id);
  }

  @Delete(':id/menu-items/:itemId')
  @Roles(Role.ADMIN)
  removeMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: User,
  ) {
    return this.restaurantsService.removeMenuItem(id, itemId, user.id);
  }

  @Post(':id/import-menu')
  @Roles(Role.ADMIN)
  importMenu(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportMenuDto,
    @CurrentUser() user: User,
  ) {
    return this.restaurantsService.importMenu(id, dto.url, user.id);
  }
}
