import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Order, OrderStatus, PaymentStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async create(orderData: any, userId: number) {
    // Prefer frontend-provided totalPrice; fall back to calculating from items if needed
    const totalPriceFromBody = Number(orderData?.totalPrice);
    const totalPrice = Number.isFinite(totalPriceFromBody) && totalPriceFromBody >= 0
      ? totalPriceFromBody
      : orderData.items.reduce((sum: number, item: any) => {
          return sum + Number(item.price) * Number(item.quantity);
        }, 0);

    // Use Prisma transaction for complex operations
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId, // Use the userId from JWT token, not from orderData
          status: orderData.status || OrderStatus.PENDING, // Use correct enum value
          paymentStatus: orderData.paymentStatus || PaymentStatus.UNPAID, // Use correct enum value
          totalPrice,
          customerName: orderData.customerName,
          customerPhone: orderData.customerPhone,
          region: orderData.region || 'Unknown',
          address: orderData.address || orderData.deliveryAddress || 'Unknown',
          items: {
            create: orderData.items.map((item: any) => ({
              variantId: Number(item.variantId), // Ensure number conversion
              quantity: Number(item.quantity), // Ensure number conversion
              price: Number(item.price), // Ensure number conversion
              frontDesign: item.frontDesign || undefined,
              backDesign: item.backDesign || undefined,
              frontPreviewUrl: item.frontPreviewUrl,
              backPreviewUrl: item.backPreviewUrl,
            })),
          },
        },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      return order;
    });

    return result;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    status?: string,
    paymentStatus?: string,
    search?: string,
    userId?: number,
  ) {
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (paymentStatus) {
      whereClause.paymentStatus = paymentStatus;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (search) {
      whereClause.OR = [
        { customerPhone: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { region: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orders = await this.prisma.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    const total = await this.prisma.order.count({ where: whereClause });

    return {
      data: orders,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
        perPage: limit,
      },
    };
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async update(id: number, updateData: any) {
    // Recalculate total price if items are updated
    let totalPrice = undefined;
    if (updateData.items) {
      totalPrice = updateData.items.reduce((sum: number, item: any) => {
        return sum + Number(item.price) * Number(item.quantity); // Ensure number conversion
      }, 0);
    }

    const updatePayload: any = { ...updateData };
    if (totalPrice !== undefined) {
      updatePayload.totalPrice = totalPrice;
    }

    // Remove items from payload as they need to be handled separately
    if (updatePayload.items) {
      delete updatePayload.items;
    }

    // Ensure userId cannot be changed during update
    delete updatePayload.userId;

    const order = await this.prisma.order.update({
      where: { id },
      data: updatePayload,
      include: {
        items: true,
      },
    });

    // If items were provided, update them
    if (updateData.items) {
      // First, delete existing items
      await this.prisma.orderItem.deleteMany({
        where: { orderId: id },
      });

      // Then create new items
      await this.prisma.orderItem.createMany({
        data: updateData.items.map((item: any) => ({
          orderId: id,
          variantId: Number(item.variantId), // Ensure number conversion
          quantity: Number(item.quantity), // Ensure number conversion
          price: Number(item.price), // Ensure number conversion
          frontDesign: item.frontDesign || undefined,
          backDesign: item.backDesign || undefined,
          frontPreviewUrl: item.frontPreviewUrl,
          backPreviewUrl: item.backPreviewUrl,
        })),
      });
    }

    // Return updated order with items
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });
  }

  async remove(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    await this.prisma.order.delete({
      where: { id },
    });

    return { message: `Order with ID ${id} has been deleted` };
  }

  async placeOrderFromCart(userId: number, shippingDetails: any) {
    // Get user's cart with items
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Validate relations
    for (const item of cart.items) {
      if (!item.variant) {
        throw new BadRequestException(
          `Variant with ID ${item.variantId} not found`,
        );
      }
    }

    // Calculate total price
    const totalPrice = cart.items.reduce((sum, item) => {
      return sum + item.variant.price * item.quantity;
    }, 0);

    // Validate total price is not zero or negative
    if (totalPrice <= 0) {
      throw new BadRequestException('Total price must be greater than zero');
    }

    // Create order in a transaction
    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING, // Use correct enum value
          paymentStatus: PaymentStatus.UNPAID, // Use correct enum value
          totalPrice,
          customerName: shippingDetails.customerName,
          customerPhone: shippingDetails.customerPhone,
          region: shippingDetails.region || 'Unknown',
          address:
            shippingDetails.address ||
            shippingDetails.deliveryAddress ||
            'Unknown',
          items: {
            create: cart.items.map((item) => ({
              variantId: Number(item.variantId), // Ensure number conversion
              quantity: Number(item.quantity), // Ensure number conversion
              price: Number(item.variant.price), // Ensure number conversion
              frontDesign: item.frontDesign || undefined,
              backDesign: item.backDesign || undefined,
              frontPreviewUrl: item.frontPreviewUrl,
              backPreviewUrl: item.backPreviewUrl,
            })),
          },
        },
        include: {
          items: {
            include: {
              variant: {
                include: {
                  product: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      // Clear the cart after creating the order
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return createdOrder;
    });

    // Send order confirmation email to the user
    if (order.user?.email) {
      try {
        await this.mailService.sendSmsToMail(
          order.user.email,
          'Order Confirmation',
          `Your order #${order.id} has been placed successfully. Total: $${order.totalPrice}. We will process your order soon.`,
          `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Order Confirmation</h2>
            <p>Dear ${order.user.fullName},</p>
            <p>Your order #${order.id} has been placed successfully.</p>
            <p><strong>Total Amount:</strong> $${order.totalPrice}</p>
            <p><strong>Status:</strong> ${order.status}</p>
            <p>We will process your order soon. Thank you for shopping with us!</p>
            <hr style="margin: 20px 0;">
            <p style="font-size: 12px; color: #666;">This is an automated message, please do not reply to this email.</p>
          </div>`,
        );
      } catch (emailError) {
        console.error('Failed to send order confirmation email:', emailError);
        // Don't throw an error as this shouldn't fail the order creation
      }
    }

    return order;
  }

  async findUserOrders(userId: number) {
    return await this.prisma.order.findMany({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getOrderPrintDetails(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }
}
