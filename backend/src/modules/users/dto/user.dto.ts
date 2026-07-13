import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../../../database/entities/enums';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** Mind. 8 Zeichen, mind. 1 Buchstabe und 1 Ziffer. */
export const PASSWORD_PATTERN = /^(?=.*[A-Za-zÄÖÜäöüß])(?=.*\d).{8,}$/;
export const PASSWORD_MESSAGE =
  'Passwort: mindestens 8 Zeichen, mindestens 1 Buchstabe und 1 Ziffer';

export class CreateUserDto {
  @IsEmail()
  @Transform(({ value }) => String(value).trim().toLowerCase())
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsIn(['de', 'en'])
  locale?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(['de', 'en'])
  locale?: string;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsIn(['de', 'en'])
  locale?: string;

  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ResetPasswordDto {
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ListUsersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** all=true → nur aktive Benutzer, ohne Paginierung (für Auswahllisten). */
  @IsOptional()
  @IsIn(['true', 'false'])
  all?: string;
}
