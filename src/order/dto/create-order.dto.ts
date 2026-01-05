import {
  IsArray,
  IsString,
  IsEnum,
  IsNumber,
  Min,
  IsOptional,
  ValidateNested,
  IsPhoneNumber,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '@prisma/client';

export class CreateOrderItemRequestDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  variantId: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 49.99 })
  @IsNumber()
  @Min(0)
  price: number;

  // DIQQAT: JSONda yuborayotgan bo'lsangiz, bu yerda ham bo'lishi kerak yoki JSONdan olib tashlash kerak
  @IsOptional()
  @IsNumber()
  orderId?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject() // Obyekt ekanligini tasdiqlash
  frontDesign?: any;

  @IsOptional()
  @IsString()
  frontPreviewUrl?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  backDesign?: any;

  @IsOptional()
  @IsString()
  backPreviewUrl?: string;

  @IsOptional()
  @IsString()
  finalPrintFile?: string;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  customerName: string;

  @ApiProperty({ example: '+998901234567' })
  @IsPhoneNumber('UZ')
  customerPhone: string;

  @ApiProperty({ example: 'Tashkent' })
  @IsString()
  region: string;

  @ApiProperty({ example: "Navoiy ko'chasi" })
  @IsString()
  address: string;

  @ApiProperty({ example: 99.99 })
  @IsNumber()
  @Min(0)
  totalPrice: number;

  @ApiPropertyOptional({
    description: 'Order status',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus = OrderStatus.PENDING;

  @ApiPropertyOptional({
    description: 'Payment status',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus = PaymentStatus.UNPAID;

  @ApiProperty({ type: [CreateOrderItemRequestDto] })
  @IsArray()
  @ValidateNested({ each: true }) // Ichki obyektlarni tekshirish uchun shart!
  @Type(() => CreateOrderItemRequestDto) // Class-transformer uchun shart!
  items: CreateOrderItemRequestDto[];
}
