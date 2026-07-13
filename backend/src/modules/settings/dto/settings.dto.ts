import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TieBreakStrategy } from '../../../database/entities/enums';

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateSettingsDto {
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'voteDeadlineTime muss HH:mm sein' })
  voteDeadlineTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'orderDeadlineTime muss HH:mm sein' })
  orderDeadlineTime?: string;

  @IsOptional()
  @IsEnum(TieBreakStrategy)
  tieBreakStrategy?: TieBreakStrategy;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  runoffMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(180)
  reminderLeadMinutes?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  autoGenerateFromTemplate?: boolean;
}
