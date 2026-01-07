import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Product } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = new Set(['id', 'createdAt', 'name', 'category']);

  // ProductService.ts ichidagi create metodini shunday yangilang:
async create(productData: any) {
  return await this.prisma.$transaction(async (tx) => {
    return await tx.product.create({
      data: {
        name: productData.name,
        description: productData.description,
        category: productData.category,
        variants: {
          create: productData.variants?.map((v: any) => ({
            color: v.color,
            size: v.size,
            price: v.price,
            stock: v.stock,
            frontImage: v.frontImage, // Rasmlar URL-larini Controllerda to'g'rilab olasiz
            backImage: v.backImage,
            printAreaTop: v.printAreaTop,
            printAreaLeft: v.printAreaLeft,
            printAreaWidth: v.printAreaWidth,
            printAreaHeight: v.printAreaHeight,
          })) || [],
        },
      },
      include: { variants: true },
    });
  }, {
    timeout: 30000 // 30 soniya timeout qo'shildi
  });
}

  async findAll(
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    category?: string,
    search?: string,
  ) {
    const safeSortBy = this.allowedSortFields.has(sortBy) ? sortBy : 'createdAt';
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (category) {
      whereClause.category = category;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where: whereClause,
      include: {
        variants: true,
      },
      skip,
      take: limit,
      orderBy: {
        [safeSortBy]: sortOrder,
      },
    });

    const total = await this.prisma.product.count({ where: whereClause });

    return {
      data: products,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        perPage: limit,
      },
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async update(id: number, updateData: any) {
    const updatePayload: any = { ...updateData };

    // Remove variants from payload as they need to be handled separately
    if (updatePayload.variants) {
      delete updatePayload.variants;
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: updatePayload,
      include: {
        variants: true,
      },
    });

    // If variants were provided, update them
    if (updateData.variants) {
      // First, delete existing variants
      await this.prisma.variant.deleteMany({
        where: { productId: id },
      });

      // Then create new variants
      await this.prisma.variant.createMany({
        data: updateData.variants.map((variant: any) => ({
          productId: id,
          color: variant.color,
          size: variant.size,
          price: variant.price,
          stock: variant.stock,
          frontImage: variant.frontImage,
          backImage: variant.backImage,
          printAreaTop: variant.printAreaTop,
          printAreaLeft: variant.printAreaLeft,
          printAreaWidth: variant.printAreaWidth,
          printAreaHeight: variant.printAreaHeight,
        })),
      });
    }

    // Return updated product with variants
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
      },
    });
  }

  async remove(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.product.delete({
      where: { id },
    });

    return { message: `Product with ID ${id} has been deleted` };
  }
}
