import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { TieBreakStrategy } from '../../../database/entities/enums';
import { TIME_PATTERN } from '../../settings/dto/settings.dto';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateDayPlanDto {
  @Matches(DATE_PATTERN, { message: 'date muss YYYY-MM-DD sein' })
  date: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  restaurantIds: string[];

  @IsOptional()
  @IsUUID()
  organizerId?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'voteDeadlineTime muss HH:mm sein' })
  voteDeadlineTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'orderDeadlineTime muss HH:mm sein' })
  orderDeadlineTime?: string;

  @IsOptional()
  @IsEnum(TieBreakStrategy)
  tieBreakStrategy?: TieBreakStrategy;
}

export class UpdateDayPlanDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  restaurantIds?: string[];

  @IsOptional()
  @IsUUID()
  organizerId?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'voteDeadlineTime muss HH:mm sein' })
  voteDeadlineTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'orderDeadlineTime muss HH:mm sein' })
  orderDeadlineTime?: string;

  @IsOptional()
  @IsEnum(TieBreakStrategy)
  tieBreakStrategy?: TieBreakStrategy;
}

export class GenerateDayPlanDto {
  @Matches(DATE_PATTERN, { message: 'date muss YYYY-MM-DD sein' })
  date: string;
}

export class RangeQueryDto {
  @IsOptional()
  @Matches(DATE_PATTERN)
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  to?: string;
}

export class DecideWinnerDto {
  @IsUUID()
  restaurantId: string;
}

export class CastVoteDto {
  @IsUUID()
  restaurantId: string;
}

export class OrderStatusDto {
  @IsOptional()
  @IsIn(['ORDERED', 'DELIVERED'])
  status?: 'ORDERED' | 'DELIVERED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ExportQueryDto {
  @IsIn(['pdf', 'xlsx'])
  format: 'pdf' | 'xlsx';
}

export class UpsertWeeklyTemplateDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @IsUUID(undefined, { each: true })
  restaurantIds: string[];

  @IsOptional()
  @IsUUID()
  organizerId?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'voteDeadlineTime muss HH:mm sein' })
  voteDeadlineTime?: string;

  @IsOptional()
  @IsEnum(TieBreakStrategy)
  tieBreakStrategy?: TieBreakStrategy | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'orderDeadlineTime muss HH:mm sein' })
  orderDeadlineTime?: string;
}
