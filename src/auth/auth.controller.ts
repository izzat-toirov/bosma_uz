import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Patch,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserService } from '../user/user.service';
import { UpdateUserDto } from '../user/dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  private getCookieValue(req: ExpressRequest | any, cookieName: string): string | undefined {
    const cookieHeader = req?.headers?.cookie;
    if (!cookieHeader || typeof cookieHeader !== 'string') return undefined;

    const cookies = cookieHeader.split(';').map((c: string) => c.trim());
    const pair = cookies.find((c: string) => c.startsWith(`${cookieName}=`));
    if (!pair) return undefined;

    const value = pair.substring(cookieName.length + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterAuthDto) {
    try {
      return await this.authService.register(dto);
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const tokens = await this.authService.login(dto);
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      return {
        user: tokens.user,
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    try {
      return await this.authService.sendOtp(dto);
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    try {
      return await this.authService.verifyOtp(dto);
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    try {
      return await this.authService.forgotPassword(dto);
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    try {
      return await this.authService.resetPassword(dto);
    } catch (error) {
      throw error;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: ExpressRequest | any,
  ) {
    try {
      const refreshToken = dto.refreshToken || this.getCookieValue(req, 'refreshToken');
      if (!refreshToken) {
        throw new Error('Refresh token not provided');
      }

      // Extract userId from JWT payload (base64url -> json)
      const payloadPart = refreshToken.split('.')[1];
      const payloadJson = Buffer.from(payloadPart, 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson) as { sub?: number };

      const userId = payload?.sub;
      if (!userId) {
        throw new Error('Invalid refresh token payload');
      }

      const tokens = await this.authService.refreshTokens(userId, refreshToken);
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      return {
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req) {
    try {
      await this.authService.logout(req.user['id']);
      return { message: 'Logged out successfully' };
    } catch (error) {
      throw error;
    }
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async getProfile(@Request() req) {
    try {
      return req.user;
    } catch (error) {
      throw error;
    }
  }

  // Controller ichida:
  // auth.controller.ts ichida

  // auth.controller.ts

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiBody({ type: UpdateProfileDto }) // <--- Yangi DTO'ni ko'rsatamiz
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Request() req,
    @Body() updateData: UpdateProfileDto, // <--- Yangi DTO'dan foydalanamiz
  ) {
    try {
      const userId = req.user.id;
      // UserService'dagi update metodini chaqiraveramiz
      return await this.userService.update(userId, updateData);
    } catch (error) {
      throw error;
    }
  }
}
