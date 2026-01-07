import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
  Query,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BaseQueryDto } from '../common/dto/base-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(AnyFilesInterceptor())
  async create(
    @Body() body: Record<string, any>, // "any" o'rniga Record ishlatish xavfsizroq
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    // 1. JSON parse mantiqi
    let parsedVariants = [];
    try {
      parsedVariants =
        typeof body.variants === 'string'
          ? JSON.parse(body.variants)
          : body.variants;
    } catch (e) {
      throw new BadRequestException('Invalid variants JSON format');
    }

    // 2. Fayllarni rasm maydonlariga joylash
    const variantsWithImages = parsedVariants.map(
      (variant: any, index: number) => {
        const frontFile = files.find(
          (f) => f.fieldname === `variant_front_${index}`,
        );
        const backFile = files.find(
          (f) => f.fieldname === `variant_back_${index}`,
        );

        return {
          ...variant,
          frontImage: frontFile ? frontFile.path : variant.frontImage || null,
          backImage: backFile ? backFile.path : variant.backImage || null,
        };
      },
    );

    // 3. Servicega yuborish
    return this.productService.create({
      name: body.name,
      description: body.description,
      category: body.category,
      variants: variantsWithImages,
    });
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Query() query: BaseQueryDto) {
    return this.productService.findAll(
      query.page,
      query.limit,
      query.sortBy,
      query.order?.toLowerCase() as 'asc' | 'desc',
      query.category,
      query.search,
    );
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productService.remove(id);
  }
}
