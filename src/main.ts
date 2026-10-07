import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, static as serveStatic } from 'express';
import * as path from 'path';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Increase payload limit for base64 image uploads (prevents 413 Request Entity Too Large)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // Serve static uploads for fallback
  app.use('/api/uploads', serveStatic(path.join(process.cwd(), 'uploads')));

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  });

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
    }),
  );

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Krishna Textiles Enterprise API')
    .setDescription(
      'Complete enterprise backend services for Krishna Textiles: User Session Management, In-Memory Cache Layer, Inventory Tracking, Order Workflow, CRM & Analytics.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 Krishna Textiles Backend running on http://localhost:${port}/api`);
  logger.log(`📚 Swagger Documentation accessible at http://localhost:${port}/api/docs`);
}

bootstrap();
