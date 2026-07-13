import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors({
    origin: [config.get<string>('appUrl') as string, 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('NIGEFA Essensbestellung API')
    .setDescription(
      'REST-API für die tägliche Essensbestellung in zwei Phasen: ' +
        'Restaurant-Abstimmung und Essensauswahl. Details: docs/04-api-spezifikation.md',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = config.get<number>('port') as number;
  await app.listen(port);
  console.log(`API läuft auf http://localhost:${port}/api/v1 — Swagger: /api/docs`);
}

void bootstrap();
