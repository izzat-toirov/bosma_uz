import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { Size } from '@prisma/client';
import { BaseQueryDto } from '../../common/dto/base-query.dto';

export class VariantQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by size',
    enum: Size,
    example: 'M',
  })
  @IsOptional()
  @IsEnum(Size)
  size?: Size;
}
