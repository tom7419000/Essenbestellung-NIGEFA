import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { User } from '../../database/entities/user.entity';
import { ReplaceOrdersDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('day-plans/:id/my-orders')
  getMyOrders(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.ordersService.getMyOrders(id, user.id);
  }

  @Put('day-plans/:id/my-orders')
  replaceMyOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceOrdersDto,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.replaceMyOrders(id, user, dto.items);
  }

  @Get('orders/my')
  history(@Query() query: PaginationDto, @CurrentUser() user: User) {
    return this.ordersService.history(user.id, query.page, query.limit);
  }
}
