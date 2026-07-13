import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DayOrganizerGuard } from '../../common/guards/day-organizer.guard';
import { Role } from '../../database/entities/enums';
import { User } from '../../database/entities/user.entity';
import { DayPlanLifecycleService } from './day-plan-lifecycle.service';
import { DayPlansService } from './day-plans.service';
import {
  CastVoteDto,
  CreateDayPlanDto,
  DecideWinnerDto,
  ExportQueryDto,
  GenerateDayPlanDto,
  OrderStatusDto,
  RangeQueryDto,
  UpdateDayPlanDto,
} from './dto/day-plan.dto';
import { ExportService } from './export.service';
import { VoteService } from './vote.service';

@ApiTags('day-plans')
@ApiBearerAuth()
@Controller('day-plans')
export class DayPlansController {
  constructor(
    private readonly dayPlansService: DayPlansService,
    private readonly lifecycleService: DayPlanLifecycleService,
    private readonly voteService: VoteService,
    private readonly exportService: ExportService,
  ) {}

  // ---------- Lesen ----------

  @Get('today')
  async today(@CurrentUser() user: User) {
    const plan = await this.dayPlansService.findToday();
    if (!plan) throw new NotFoundException('Für heute existiert kein Tagesplan');
    // Catch-up: fällige Übergänge auch ohne Scheduler anwenden (z. B. in Tests).
    await this.lifecycleService.catchUp(plan);
    return this.dayPlansService.buildDetail(plan.id, user);
  }

  @Get()
  list(@Query() query: RangeQueryDto) {
    return this.dayPlansService.list(query.from, query.to);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.dayPlansService.buildDetail(id, user);
  }

  @Get(':id/votes')
  @Roles(Role.ADMIN)
  votes(@Param('id', ParseUUIDPipe) id: string) {
    return this.dayPlansService.listVotes(id);
  }

  // ---------- Verwaltung (Admin) ----------

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateDayPlanDto, @CurrentUser() user: User) {
    const plan = await this.dayPlansService.create(dto, user.id);
    return this.dayPlansService.buildDetail(plan.id, user);
  }

  @Post('generate')
  @Roles(Role.ADMIN)
  async generate(@Body() dto: GenerateDayPlanDto, @CurrentUser() user: User) {
    const plan = await this.dayPlansService.generateFromTemplate(dto.date, user.id);
    return this.dayPlansService.buildDetail((plan as { id: string }).id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDayPlanDto,
    @CurrentUser() user: User,
  ) {
    await this.dayPlansService.update(id, dto, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.dayPlansService.remove(id, user.id);
  }

  // ---------- Manuelle Phasensteuerung (Admin) ----------

  @Post(':id/open-voting')
  @Roles(Role.ADMIN)
  async openVoting(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.lifecycleService.openVoting(id, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Post(':id/close-voting')
  @Roles(Role.ADMIN)
  async closeVoting(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.lifecycleService.closeVoting(id, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Post(':id/close-ordering')
  @Roles(Role.ADMIN)
  async closeOrdering(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.lifecycleService.closeOrdering(id, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Post(':id/reopen-ordering')
  @Roles(Role.ADMIN)
  async reopenOrdering(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.lifecycleService.reopenOrdering(id, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Post(':id/decide-winner')
  @Roles(Role.ADMIN)
  async decideWinner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideWinnerDto,
    @CurrentUser() user: User,
  ) {
    await this.lifecycleService.decideWinner(id, dto.restaurantId, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.lifecycleService.cancel(id, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  // ---------- Abstimmung (alle Benutzer) ----------

  @Put(':id/vote')
  castVote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CastVoteDto,
    @CurrentUser() user: User,
  ) {
    return this.voteService.castVote(id, user, dto.restaurantId);
  }

  @Delete(':id/vote')
  removeVote(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.voteService.removeVote(id, user);
  }

  // ---------- Organisator (oder Admin) ----------

  @Get(':id/summary')
  @UseGuards(DayOrganizerGuard)
  summary(@Param('id', ParseUUIDPipe) id: string) {
    return this.dayPlansService.summary(id);
  }

  @Patch(':id/order-status')
  @UseGuards(DayOrganizerGuard)
  async orderStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OrderStatusDto,
    @CurrentUser() user: User,
  ) {
    await this.lifecycleService.setOrderStatus(id, dto.status, dto.note, user.id);
    return this.dayPlansService.buildDetail(id, user);
  }

  @Get(':id/export')
  @UseGuards(DayOrganizerGuard)
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExportQueryDto,
    @Res() res: Response,
  ) {
    const summary = await this.dayPlansService.summary(id);
    const date = summary.dayPlan.date;
    if (query.format === 'pdf') {
      const buffer = await this.exportService.buildPdf(summary);
      res
        .set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="bestellung-${date}.pdf"`,
        })
        .send(buffer);
      return;
    }
    const buffer = await this.exportService.buildXlsx(summary);
    res
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bestellung-${date}.xlsx"`,
      })
      .send(buffer);
  }
}
