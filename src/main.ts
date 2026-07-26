import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // 1. Structured Logging
  app.useLogger(app.get(Logger));

  // 2. Security Headers via Helmet
  app.use(helmet());

  // 3. CORS Configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // 4. Global API Prefix
  app.setGlobalPrefix('api/v1', { exclude: ['health', ''] });

  // 5. Global Validation Pipe (Sanitization & Input Protection)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 6. OpenAPI / Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Multi-Tenant Invoice SaaS API')
    .setDescription('Production REST API documentation for Invoice SaaS platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Application is running on: http://localhost:${port}/api/v1`);
  app.get(Logger).log(`Swagger documentation available at: http://localhost:${port}/api/docs`);
}

void bootstrap();
