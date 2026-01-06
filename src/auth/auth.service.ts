import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Role } from '@prisma/client';
import { SecurityService } from '../common/security/security.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private securityService: SecurityService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    // Security: Check if role is being passed in the DTO and reject it
    if (createUserDto.role) {
      throw new BadRequestException(
        'Role cannot be specified during registration',
      );
    }

    // Update the DTO to explicitly set role to USER and isActive to false
    const userDto = {
      ...createUserDto,
      role: Role.USER, // Explicitly set role to USER using the enum
      isActive: false, // Explicitly set isActive to false
    };

    const user = await this.userService.create(userDto);

    // Return only success message and user object (without password)
    return {
      message: 'Account created. Please request an OTP to verify your account.',
      user,
    };
  }

  async login(loginUserDto: LoginUserDto) {
    const user = await this.userService.findByEmail(loginUserDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // The VERY FIRST check must be if the user is active
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is inactive. Please verify your account via OTP first.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginUserDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessTokenTime = this.configService
      .get<string>('ACCESS_TOKEN_TIME', '15m')
      .replace(/"/g, '');
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessTokenTime as any,
    });
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: '7d' },
    );

    // Hash and store the refresh token
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userService.update(user.id, {
      hashedRefreshToken: hashedRefreshToken,
    });

    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        region: user.region,
        address: user.address,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(userId: number, refreshToken: string) {
    const user = await this.userService.findUserWithRefreshToken(userId); // Use a method that returns the full user object with hashedRefreshToken
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid token');
    }

    // Check if user has a hashedRefreshToken
    if (!user.hashedRefreshToken) {
      throw new UnauthorizedException('Session expired or invalid token');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Session expired or invalid token');
    }

    // This same 'isActive' check must be applied in the 'refreshTokens' method
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is inactive. Please verify your account via OTP first.',
      );
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessTokenTime = this.configService
      .get<string>('ACCESS_TOKEN_TIME', '15m')
      .replace(/"/g, '');
    const newAccessToken = await this.jwtService.signAsync(payload, {
      expiresIn: accessTokenTime as any,
    });
    const newRefreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: '7d' },
    );

    // Update the stored refresh token
    const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, 10);
    await this.userService.update(user.id, {
      hashedRefreshToken: hashedNewRefreshToken,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(userId: number) {
    // Clear the refresh token from the database
    await this.userService.update(userId, { hashedRefreshToken: null });
    return { message: 'Logged out successfully' };
  }

  // Manual OTP Flow - This method must be the only way to generate a 6-digit OTP
  async sendOtp(dto: SendOtpDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    // Generate a random 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Set OTP expiration (5-10 minutes from now) - using 5 minutes
    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 5);

    // Hash the OTP and save it to the user record
    await this.userService.update(user.id, {
      otpCode: await bcrypt.hash(otpCode, 10),
      otpExpires: otpExpires,
    });

    // Send OTP via email using MailService with error handling
    try {
      await this.mailService.sendOtp(dto.email, otpCode);
    } catch (error) {
      console.error('Email service failed to send OTP:', error);
      throw new InternalServerErrorException(
        'Email service failed to send OTP',
      );
    }

    return {
      message: 'OTP sent successfully. Please check your email.',
    };
  }

  // Verify OTP and activate account
  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    // Check if OTP code exists
    if (!user.otpCode) {
      throw new BadRequestException(
        'No OTP code found for this user. Please request a new OTP.',
      );
    }

    // Check if OTP has expired
    const now = new Date();
    if (user.otpExpires && user.otpExpires < now) {
      throw new BadRequestException(
        'OTP has expired. Please request a new OTP.',
      );
    }

    // Compare the provided OTP with the hashed version in the DB
    const isOtpValid = await bcrypt.compare(dto.otpCode, user.otpCode);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid OTP code. Please try again.');
    }

    // If valid and not expired, set 'isActive: true' and nullify the OTP fields
    await this.userService.update(user.id, {
      isActive: true,
      otpCode: null,
      otpExpires: null,
    });

    return {
      message: 'Account verified successfully. You can now log in.',
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        region: user.region,
        address: user.address,
        isActive: true,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  // Forgot password - must only work if the user exists and trigger OTP generation logic
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      // For security, we don't reveal if the email exists
      return {
        message: 'If the email exists, an OTP has been sent to your email.',
      };
    }

    // Generate a random 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Set OTP expiration (5 minutes from now)
    const otpExpires = new Date();
    otpExpires.setMinutes(otpExpires.getMinutes() + 5);

    // Hash the OTP and save it to the user record
    await this.userService.update(user.id, {
      otpCode: await bcrypt.hash(otpCode, 10),
      otpExpires: otpExpires,
    });

    // Send OTP via email using MailService
    await this.mailService.sendPasswordResetOtp(dto.email, otpCode);

    return {
      message: 'If the email exists, an OTP has been sent to your email.',
    };
  }

  // Reset password - must verify the OTP first, then allow password update and set 'isActive: true'
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    // OTP tekshiruvlari (o'zgarishsiz qoladi...)
    // ...

    // ⚠️ DIQQAT: Bu yerda o'zingiz hash qilmang!
    // Faqat userService.update ga uzating, u o'zi hash qiladi.
    await this.userService.update(user.id, {
      password: dto.newPassword, // <--- Shunchaki yangi parolni o'zini yuboring
      isActive: true,
      otpCode: null,
      otpExpires: null,
    });

    return { message: 'Password reset successfully' };
  }
}
