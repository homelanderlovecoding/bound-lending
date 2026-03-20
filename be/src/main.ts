import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ENV_REGISTER } from './commons/constants';
import { IAppConfig } from './commons/types';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS — allow FE origins
  app.enableCors({
    origin: [
      'https://bound-lending.vercel.app',
      'https://fe-eosin-pi.vercel.app',
      /\.vercel\.app$/,
      'http://localhost:3001',
      'http://localhost:3000',
    ],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bound Lending API')
    .setDescription('BTC-collateralized lending platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Start
  const configService = app.get(ConfigService);
  const appConfig = configService.get<IAppConfig>(ENV_REGISTER.APP);
  const port = appConfig?.port ?? 3000;

  await app.listen(port);
  console.log(`Bound Lending API running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}

bootstrap();
