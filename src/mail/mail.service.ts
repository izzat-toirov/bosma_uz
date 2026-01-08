import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const host =
      this.configService.get<string>('MAIL_HOST') ||
      this.configService.get<string>('smtp_host') ||
      'smtp.gmail.com';

    const portRaw =
      this.configService.get<string>('MAIL_PORT') ||
      (this.configService.get<number>('MAIL_PORT') as any) ||
      this.configService.get<string>('smtp_port') ||
      '465';
    const port = Number(portRaw);

    const secureRaw =
      this.configService.get<string>('MAIL_SECURE') ||
      (this.configService.get<boolean>('MAIL_SECURE') as any) ||
      this.configService.get<string>('smtp_secure');
    const secure =
      secureRaw === undefined || secureRaw === null
        ? port === 465
        : ['true', '1', 'yes'].includes(String(secureRaw).toLowerCase());

    const user =
      this.configService.get<string>('MAIL_USER') ||
      this.configService.get<string>('smtp_user');
    const pass =
      this.configService.get<string>('MAIL_PASS') ||
      this.configService.get<string>('smtp_password');

    if (!user || !pass) {
      throw new InternalServerErrorException(
        'MAIL_USER/MAIL_PASS environment variables are not set',
      );
    }

    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('MAIL_USER') ||
      this.configService.get<string>('smtp_user') ||
      user;

    // Nodemailer transporter configuration using environment variables
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000, // 10 seconds
    });
  }

  async sendSmsToMail(
    email: string,
    subject: string,
    text: string,
    html?: string,
  ) {
    try {
      await this.transporter.sendMail({
        from: `"Verification" <${this.fromAddress}>`,
        to: email,
        subject,
        text,
        html,
      });

      return { message: `Successfully sent email to ${email}` };
    } catch (error) {
      console.error('Email Error:', error);
      console.error('Mail yuborishda xatolik:', error.message);

      // Agar kunlik limit tugagan bo'lsa, foydalanuvchiga bildirish
      if (
        error.responseCode === 550 &&
        error.message.includes('Daily user sending limit exceeded')
      ) {
        console.warn(
          '⚠️ Google SMTP kunlik limiti tugadi. Email yuborilmadi, lekin dastur ishlashda davom etadi.',
        );
        // Xatoni yutib yuboramiz, shunda dastur to'xtab qolmaydi.
        // Haqiqiy loyihada bu yerda boshqa SMTP ga o'tish yoki queue ga qo'yish kerak bo'ladi.
        return {
          message:
            'Email limit exceeded, email not sent but process continued.',
        };
      }

      throw new InternalServerErrorException(
        error.message || 'MailService internal server error',
      );
    }
  }

  async sendOtp(email: string, otpCode: string) {
    try {
      await this.sendSmsToMail(
        email,
        'Verification code',
        `Your verification code is: ${otpCode}. It expires in 5 minutes.`,
        `<div style="text-align: center; background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="background-color: #007bff; color: white; font-size: 32px; padding: 15px; border-radius: 6px; display: inline-block; min-width: 200px;">
            ${otpCode}
          </div>
          <p style="font-size: 16px; color: #666; margin-top: 15px;">This code expires in 5 minutes.</p>
        </div>`,
      );

      return {
        message: 'Verification code sent successfully',
      };
    } catch (error) {
      console.error('Email Error:', error);
      throw new InternalServerErrorException(
        error.message || 'Failed to send OTP',
      );
    }
  }

  async sendPasswordResetOtp(email: string, otpCode: string) {
    try {
      await this.sendSmsToMail(
        email,
        'Password Reset OTP',
        `Your verification code for password reset is: ${otpCode}. It expires in 10 minutes.`,
        `<div style="text-align: center; background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="background-color: #28a745; color: white; font-size: 32px; padding: 15px; border-radius: 6px; display: inline-block; min-width: 200px;">
            ${otpCode}
          </div>
          <p style="font-size: 16px; color: #666; margin-top: 15px;">This code expires in 10 minutes. Use this code to reset your password.</p>
        </div>`,
      );

      return {
        message: 'Password reset OTP sent successfully',
      };
    } catch (error) {
      console.error('Email Error:', error);
      throw new InternalServerErrorException(
        error.message || 'Failed to send password reset OTP',
      );
    }
  }
}
