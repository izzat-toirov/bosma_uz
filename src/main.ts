import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UserService } from './user/user.service';
import * as express from 'express';

async function start() {
  try {
    const PORT = process.env.PORT || 3030;
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Set payload size limits to handle large requests
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // CORS sozlamalari
    const vercelOrigin = process.env.FRONTEND_URL || process.env.VERCEL_FRONTEND_URL;
    const allowAllOriginsForTesting =
      String(process.env.CORS_ORIGIN_ALL || '').toLowerCase() === 'true';

    const allowedOrigins = [
      'http://localhost:5173',
      'https://your-vercel-domain.vercel.app',
      vercelOrigin,
    ].filter((origin): origin is string => !!origin);

    app.enableCors({
      origin: allowAllOriginsForTesting
        ? true
        : (origin, callback) => {
            // Allow non-browser clients (curl/postman) where Origin might be undefined
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(null, false);
          },
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type, Accept, Authorization',
    });

    // Xavfsizlik uchun Helmet
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      }),
    );

    // Ma'lumotlarni tekshirish (Validation)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) => {
          const messages = errors.map((error) => {
            if (error.constraints) {
              return Object.values(error.constraints).join(', ');
            }
            return `${error.property} has wrong value`;
          });
          return new BadRequestException(messages.join('; '));
        },
      }),
    );

    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());

    // Rasmlar va fayllar uchun papka
    app.useStaticAssets(join(__dirname, '../../uploads'), {
      prefix: '/uploads',
    });

    // Swagger - API hujjatlari
    const config = new DocumentBuilder()
      .setTitle('Bosma.uz - Print-on-Demand Platform')
      .setDescription(
        'RESTful API for Bosma.uz platform with design customization and admin dashboard',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    // Super Admin yaratish
    const userService = app.get(UserService);
    await userService.createSuperAdmin();

    // Serverni ishga tushirish (Render uchun 0.0.0.0 muhim)
    await app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server is running on port: ${PORT}`);
      console.log(`📚 Swagger: http://0.0.0.0:${PORT}/api/docs`);
      console.log(`📚 Swagger: http://localhost:${PORT}/api/docs`);
    });
  } catch (error) {
    console.error('❌ Server startup error:', error);
  }
}

start();
