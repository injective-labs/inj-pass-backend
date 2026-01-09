import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PasskeyModule } from './passkey/passkey.module';

@Module({
  imports: [
    // Load .env file (MUST be first)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // PostgreSQL Configuration (Supabase)
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production', // Auto-create tables in dev
      ssl: {
        rejectUnauthorized: false, // Required for Supabase
      },
      logging: process.env.NODE_ENV === 'development',
    }),

    // Redis Configuration (Upstash)
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
          throw new Error('REDIS_URL environment variable is not set');
        }

        return {
          store: await redisStore({
            url: redisUrl,
            ttl: 60000, // Default TTL: 60 seconds (in milliseconds)
          }),
        };
      },
    }),

    PasskeyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
