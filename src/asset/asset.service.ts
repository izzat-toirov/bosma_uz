import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetQueryDto } from './dto/asset-query.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { SecurityService } from '../common/security/security.service';

@Injectable()
export class AssetService {
  constructor(
    private prisma: PrismaService,
    private supabaseService: SupabaseService,
    private securityService: SecurityService,
  ) {}

  private readonly allowedSortFields = new Set(['id', 'createdAt']);

  async create(createAssetDto: CreateAssetDto) {
    try {
      const asset = await this.prisma.asset.create({
        data: createAssetDto,
      });

      return asset;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Asset already exists');
        } else if (error.code === 'P2025') {
          throw new NotFoundException('Record not found');
        }
      }
      throw new BadRequestException('Failed to create asset');
    }
  }

  async uploadFile(file: Express.Multer.File, userId: number) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate image file type
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Allowed types: ${allowedMimes.join(', ')}`,
      );
    }

    try {
      // Upload file to Supabase with proper folder hierarchy
      const fileUrl = await this.supabaseService.uploadFile(file, 'assets');

      // Create asset record
      const asset = await this.prisma.asset.create({
        data: {
          url: fileUrl,
          userId: userId,
        },
      });

      return asset;
    } catch (error) {
      throw new BadRequestException(`File upload failed: ${error.message}`);
    }
  }

  async findAll(userId: number, query?: AssetQueryDto) {
    try {
      const page = query?.page ?? 1;
      const limit = query?.limit ?? 10;
      const skip = (page - 1) * limit;
      const search = query?.search?.trim();

      const safeSortBy = this.allowedSortFields.has(query?.sortBy ?? '') ? (query?.sortBy as string) : 'createdAt';
      const sortOrder = (query?.order?.toLowerCase() as 'asc' | 'desc') ?? 'desc';

      const whereClause: any = { userId };
      if (search) {
        whereClause.url = { contains: search, mode: 'insensitive' };
      }

      const [items, total] = await Promise.all([
        this.prisma.asset.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: {
            [safeSortBy]: sortOrder,
          },
        }),
        this.prisma.asset.count({ where: whereClause }),
      ]);

      return {
        data: items,
        meta: {
          total,
          page,
          lastPage: Math.ceil(total / limit),
          perPage: limit,
        },
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Assets not found');
        }
      }
      throw new BadRequestException('Failed to retrieve assets');
    }
  }

  async findOne(id: number, userId: number) {
    try {
      const asset = await this.prisma.asset.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      });

      if (!asset) {
        throw new NotFoundException(`Asset with ID ${id} not found`);
      }

      // Check if the asset belongs to the user
      this.securityService.validateOwnership(userId, asset.userId, 'asset');

      return asset;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Asset with ID ${id} not found`);
        }
      }
      throw new BadRequestException('Failed to retrieve asset');
    }
  }

  async update(id: number, updateAssetDto: UpdateAssetDto, userId: number) {
    try {
      const asset = await this.prisma.asset.findUnique({
        where: { id },
      });

      if (!asset) {
        throw new NotFoundException(`Asset with ID ${id} not found`);
      }

      // Check if the asset belongs to the user
      this.securityService.validateOwnership(userId, asset.userId, 'asset');

      const updatedAsset = await this.prisma.asset.update({
        where: { id },
        data: updateAssetDto,
      });

      return updatedAsset;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Asset already exists');
        } else if (error.code === 'P2025') {
          throw new NotFoundException(`Asset with ID ${id} not found`);
        }
      }
      throw new BadRequestException('Failed to update asset');
    }
  }

  async remove(id: number, userId: number) {
    try {
      const asset = await this.prisma.asset.findUnique({
        where: { id },
      });

      if (!asset) {
        throw new NotFoundException(`Asset with ID ${id} not found`);
      }

      // Check if the asset belongs to the user
      this.securityService.validateOwnership(userId, asset.userId, 'asset');

      // Soft-warning: Check if the asset is currently used in any CartItem or OrderItem designs
      const { cartItems, orderItems } =
        await this.securityService.checkAssetUsage(asset.url);

      if (cartItems > 0 || orderItems > 0) {
        console.warn(
          `⚠️ Asset with ID ${id} is currently used in ${cartItems} cart items and ${orderItems} order items. Proceeding with deletion...`,
        );
      }

      // Delete file from Supabase storage
      try {
        await this.supabaseService.deleteFile(asset.url);
      } catch (error) {
        console.error('Error deleting file from Supabase:', error.message);
        // Continue with asset deletion even if file deletion fails
      }

      // Delete asset record
      await this.prisma.asset.delete({
        where: { id },
      });

      return { message: `Asset with ID ${id} has been deleted` };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Asset with ID ${id} not found`);
        }
      }
      throw new BadRequestException('Failed to delete asset');
    }
  }
}
