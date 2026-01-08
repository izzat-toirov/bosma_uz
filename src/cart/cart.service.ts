import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  // Savatchani barcha itemlari va bog'liqliklari bilan olish uchun umumiy "include" obyekti
  private readonly cartInclude = {
    items: {
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    },
  };

  // Savatcha yaratish va darhol hamma narsani include qilib qaytarish
  private async create(userId: number) {
    return await this.prisma.cart.create({
      data: { userId },
      include: this.cartInclude, // TypeScript xatosini oldini olish uchun
    });
  }

  // Foydalanuvchining o'z savatchasini olish
  async getMyCart(userId: number) {
    let cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: this.cartInclude,
    });

    // Agar savatcha yo'q bo'lsa, yangi yaratamiz
    if (!cart) {
      cart = await this.create(userId);
    }

    return cart;
  }

  // Savatchaga mahsulot qo'shish
  async addItemToCart(userId: number, variantId: number, quantity: number, designData?: any) {
    let cart = await this.prisma.cart.findFirst({ where: { userId } });
    
    if (!cart) {
      cart = await this.create(userId);
    }

    // Variant bormi?
    const variant = await this.prisma.variant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Product variant not found');

    // Prisma JSON fields cannot be reliably compared using complex objects in `where`.
    // We only dedupe by cartId + variantId; if a matching item exists, we increase quantity.
    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        variantId,
      },
    });

    if (existingItem) {
      return await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity },
      });
    }

    return await this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId,
        quantity,
        frontDesign: designData?.frontDesign,
        backDesign: designData?.backDesign,
        frontPreviewUrl: designData?.frontPreviewUrl,
        backPreviewUrl: designData?.backPreviewUrl,
      },
    });
  }

  // Savatchadagi item miqdorini o'zgartirish
  async updateCartItem(userId: number, itemId: number, quantity: number) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: { userId },
      },
    });

    if (!cartItem) throw new NotFoundException('Cart item not found');

    if (quantity <= 0) {
      return await this.prisma.cartItem.delete({ where: { id: itemId } });
    }

    return await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  // Savatchadan bitta elementni o'chirish
  async removeItem(userId: number, itemId: number) {
    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: { userId },
      },
    });

    if (!cartItem) throw new NotFoundException('Cart item not found');

    return await this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  // Savatchani Orderga o'tkazish
  async convertCartToOrder(userId: number, shippingDetails: any) {
    const cart = await this.prisma.cart.findFirst({
      where: { userId },
      include: { items: { include: { variant: true } } },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const totalPrice = cart.items.reduce(
      (sum, item) => sum + (item.variant?.price || 0) * item.quantity,
      0,
    );

    return await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          totalPrice,
          customerName: shippingDetails.customerName,
          customerPhone: shippingDetails.customerPhone,
          region: shippingDetails.region,
          address: shippingDetails.address,
          items: {
            create: cart.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              price: item.variant?.price || 0,
              frontDesign: item.frontDesign ?? undefined,
              backDesign: item.backDesign ?? undefined,
              frontPreviewUrl: item.frontPreviewUrl,
              backPreviewUrl: item.backPreviewUrl,
            })),
          },
        },
      });

      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return order;
    });
  }

  // Savatchani to'liq tozalash
  async clearCart(userId: number) {
    await this.prisma.cartItem.deleteMany({
      where: { cart: { userId } },
    });
    return { message: 'Cart cleared successfully' };
  }
}