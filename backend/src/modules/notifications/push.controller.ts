import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsString, IsUrl, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { PushService } from './push.service';

class PushKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

class SubscribeDto {
  @IsUrl({ require_tld: false })
  endpoint: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

class UnsubscribeDto {
  @IsUrl({ require_tld: false })
  endpoint: string;
}

@ApiTags('push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  getKey() {
    return { key: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(204)
  async subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: User) {
    await this.pushService.subscribe(user.id, dto.endpoint, dto.keys);
  }

  @Delete('subscribe')
  @HttpCode(204)
  async unsubscribe(@Body() dto: UnsubscribeDto, @CurrentUser() user: User) {
    await this.pushService.unsubscribe(user.id, dto.endpoint);
  }
}
