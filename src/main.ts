import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UserService } from './user/user.service';

async function start() {
  try {
    const PORT = process.env.PORT || 3030;
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    // Security middlewares
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

    // Global validation pipe with security enhancements
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        // Transform validation errors to more descriptive messages
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

    // Apply global exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    // Serve static files from the uploads directory
    app.useStaticAssets(join(__dirname, '../../uploads'), {
      prefix: '/uploads',
    });

    const config = new DocumentBuilder()
      .setTitle('Bosma.uz - Print-on-Demand Platform')
      .setDescription(
        'RESTful API for Bosma.uz Print-on-Demand platform with design customization, order management, and admin dashboard',
      )
      .setVersion('1.0')
      .addTag('auth', 'Authentication endpoints')
      .addTag('users', 'User management')
      .addTag('products', 'Product management')
      .addTag('variants', 'Product variant management')
      .addTag('orders', 'Order management')
      .addTag('carts', 'Shopping cart functionality')
      .addTag('file-upload', 'File upload with image processing')
      .addTag('admin', 'Admin-specific endpoints')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    const userService = app.get(UserService);
    await userService.createSuperAdmin();


    await app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server is running on port: ${PORT}`);
      console.log(`📚 Swagger documentation: http://0.0.0.0:${PORT}/api/docs`);
    });
  } catch (error) {
    console.log(error);
  }
}

start();
