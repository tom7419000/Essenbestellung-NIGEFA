import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Role } from '../../database/entities/enums';
import { AuditService } from './audit.service';

class AuditQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    return this.auditService.list({
      page: query.page,
      limit: query.limit,
      action: query.action,
      actorId: query.actorId,
    });
  }
}
