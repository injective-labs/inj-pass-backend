import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';

const server: Express = express();

export const createNextServer = async (expressInstance: any) => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ORIGINS?.split(',').map(o => o.trim()) || [];
      
      // Allow requests without origin (e.g., mobile apps, Postman) or from allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, Cookie',
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // API prefix
  app.setGlobalPrefix('api');

  return app;
};

let isInitialized = false;

async function bootstrap() {
  if (isInitialized) return;
  const app = await createNextServer(server);
  await app.init();
  isInitialized = true;

  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const port = process.env.PORT ?? 3001;
    await app.listen(port);
    console.log(`Backend running on http://localhost:${port}`);
  }
}

// Development bootstrap
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  bootstrap();
}

// Export for Vercel Serverless
export default async (req: any, res: any) => {
  await bootstrap();
  return (server as any)(req, res);
};
