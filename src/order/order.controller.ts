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
  Request,
  UseGuards,
  ParseIntPipe,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createOrderDto: CreateOrderDto, @Request() req) {
    // Extract userId from JWT token, never from request body
    // This ensures users can only create orders for their own account
    const userId = req.user.id;
    return this.orderService.create(createOrderDto, userId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async placeOrderFromCart(@Request() req, @Body() shippingDetails: any) {
    // Extract userId from JWT token, never from request body
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.orderService.placeOrderFromCart(req.user.id, shippingDetails);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async findAll(@Request() req) {
    // Admins can view all orders, regular users can only view their own orders
    if (req.user.role === Role.USER) {
      return this.orderService.findUserOrders(req.user.id);
    } else {
      // Admins can see all orders
      return this.orderService.findAll();
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    // Check ownership for regular users
    if (req.user.role === Role.USER) {
      const order = await this.orderService.findOne(id);
      if (order.userId !== req.user.id) {
        throw new ForbiddenException('You can only access your own orders');
      }
      return order;
    } else {
      // Admins can access any order
      return this.orderService.findOne(id);
    }
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.orderService.update(id, updateOrderDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
    @Request() req,
  ) {
    // Only admins can update orders
    if (req.user.role === Role.USER) {
      throw new ForbiddenException('Only admins can update orders');
    }
    return this.orderService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.remove(id);
  }

  /**
   * Admin endpoint to get detailed print files information for an order
   * @param id The order ID
   * @returns Detailed order information with print files
   */
  @Get(':id/print-files')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  getOrderPrintDetails(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.getOrderPrintDetails(id);
  }
}
