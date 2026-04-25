import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';


const server: Express = express();

function getAllowedOrigins() {
  const configuredOrigins =
    process.env.ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    return Array.from(
      new Set([
        ...configuredOrigins,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3002',
      ]),
    );
  }

  return configuredOrigins;
}

function isAllowedLocalOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname;
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === 'host.docker.internal'
    ) {
      return true;
    }

    // Allow private-network IPv4 hosts during local development.
    if (/^10\./.test(host) || /^192\.168\./.test(host)) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export const createNextServer = async (expressInstance: any) => {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );

  const allowedOrigins = getAllowedOrigins();
  const isLocalRuntime =
    process.env.NODE_ENV !== 'production' || !process.env.VERCEL;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests without origin (e.g., mobile apps, Postman) or from allowed origins
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (isLocalRuntime && isAllowedLocalOrigin(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, Cookie, x-admin-key',
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
