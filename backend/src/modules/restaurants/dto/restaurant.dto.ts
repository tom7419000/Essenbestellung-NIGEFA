import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRestaurantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cuisine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  menuUrl?: string;
}

export class UpdateRestaurantDto extends CreateRestaurantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateMenuItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000)
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class ImportMenuDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}
