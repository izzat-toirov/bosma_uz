import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Size, Variant } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class VariantService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = new Set(['id', 'price', 'stock']);

  async create(variantData: any) {
    // Validate that productId exists
    const product = await this.prisma.product.findUnique({
      where: { id: variantData.productId },
    });

    if (!product) {
      throw new BadRequestException('Product does not exist');
    }

    // Extract productId to use in the connect relation
    const { productId, ...restData } = variantData;

    const variant = await this.prisma.variant.create({
      data: {
        ...restData,
        product: {
          connect: { id: productId },
        },
      },
    });

    return variant;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'id',
    sortOrder: 'asc' | 'desc' = 'desc',
    productId?: number,
    search?: string,
    size?: Size,
  ) {
    const safeSortBy = this.allowedSortFields.has(sortBy) ? sortBy : 'id';
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (productId) {
      whereClause.productId = productId;
    }

    if (size) {
      whereClause.size = size;
    }

    if (search) {
      whereClause.OR = [
        { color: { contains: search, mode: 'insensitive' } },
        { size: { contains: search, mode: 'insensitive' } },
      ];
    }

    const variants = await this.prisma.variant.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: {
        [safeSortBy]: sortOrder,
      },
    });

    const total = await this.prisma.variant.count({ where: whereClause });

    return {
      data: variants,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        perPage: limit,
      },
    };
  }

  async findOne(id: number) {
    const variant = await this.prisma.variant.findUnique({
      where: { id },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${id} not found`);
    }

    return variant;
  }

  async update(id: number, updateData: any) {
    // If productId is being updated, validate it exists
    if (updateData.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: updateData.productId },
      });

      if (!product) {
        throw new BadRequestException('Product does not exist');
      }
    }

    // Extract productId if it exists to handle the relation properly
    if (updateData.productId) {
      const { productId, ...restData } = updateData;
      const variant = await this.prisma.variant.update({
        where: { id },
        data: {
          ...restData,
          product: {
            connect: { id: productId },
          },
        },
      });
      return variant;
    }

    const variant = await this.prisma.variant.update({
      where: { id },
      data: updateData,
    });

    return variant;
  }

  async remove(id: number) {
    const variant = await this.prisma.variant.findUnique({
      where: { id },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${id} not found`);
    }

    await this.prisma.variant.delete({
      where: { id },
    });

    return { message: `Variant with ID ${id} has been deleted` };
  }
}
