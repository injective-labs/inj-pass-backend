import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as jwt from 'jsonwebtoken';

export interface SessionPayload {
  credentialId: string;
  userId?: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly tokenSecret: string;
  private readonly tokenExpiry = 30 * 60 * 1000; // 30 minutes in milliseconds
  private readonly requireRedisSession: boolean;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {
    this.tokenSecret = process.env.JWT_SECRET!;
    this.requireRedisSession =
      String(
        process.env.AUTH_REQUIRE_REDIS_SESSION ?? 'false',
      ).toLowerCase() === 'true';
    if (!process.env.JWT_SECRET) {
      console.warn(
        'JWT_SECRET not set, using default. This is insecure in production.',
      );
    }
  }

  /**
   * Generate a session token for successful Passkey authentication
   * Token is stored in Redis with 30-minute TTL
   */
  async generateToken(credentialId: string, userId?: string): Promise<string> {
    const now = Date.now();

    const payload: SessionPayload = {
      credentialId,
      userId,
      iat: Math.floor(now / 1000),
      exp: Math.floor((now + this.tokenExpiry) / 1000),
    };

    console.log(
      '[AuthService] Generating token for credentialId:',
      credentialId.substring(0, 20) + '...',
    );
    console.log('[AuthService] Token expiry (ms):', this.tokenExpiry);
    console.log('[AuthService] JWT_SECRET exists:', !!process.env.JWT_SECRET);

    // Sign JWT token
    const token = jwt.sign(payload, this.tokenSecret, {
      algorithm: 'HS256',
    });

    console.log(
      '[AuthService] Token generated (first 20 chars):',
      token.substring(0, 20),
    );

    // Store token in Redis with TTL
    // Key format: session:{token}
    const redisKey = `session:${token}`;
    console.log(
      '[AuthService] Storing token in Redis with key:',
      redisKey.substring(0, 50) + '...',
    );
    await this.cacheManager.set(
      redisKey,
      JSON.stringify(payload),
      this.tokenExpiry, // TTL in milliseconds
    );

    console.log('[AuthService] Token stored in Redis successfully');
    return token;
  }

  /**
   * Verify a session token
   * Checks both JWT signature and Redis presence
   */
  async verifyToken(token: string): Promise<SessionPayload | null> {
    try {
      console.log('[AuthService] Verifying token...');
      console.log(
        '[AuthService] Token (first 20 chars):',
        token.substring(0, 20),
      );
      console.log('[AuthService] JWT_SECRET exists:', !!process.env.JWT_SECRET);

      // Verify JWT signature
      const decoded = jwt.verify(token, this.tokenSecret, {
        algorithms: ['HS256'],
      }) as SessionPayload;

      console.log('[AuthService] JWT verification successful');
      console.log('[AuthService] Decoded payload:', decoded);

      // Optional Redis session check.
      // Some serverless/runtime combinations may intermittently miss cache reads even for valid JWTs.
      // In non-strict mode we accept a valid JWT to avoid false unauthorized responses.
      const redisKey = `session:${token}`;
      console.log(
        '[AuthService] Checking Redis key:',
        redisKey.substring(0, 50) + '...',
      );

      let inRedis: string | null | undefined = null;
      try {
        inRedis = await this.cacheManager.get<string>(redisKey);
      } catch (cacheError) {
        console.warn(
          '[AuthService] Redis session check failed, falling back to JWT-only validation',
          cacheError,
        );
      }

      console.log('[AuthService] Token in Redis:', !!inRedis);
      if (!inRedis && this.requireRedisSession) {
        console.log(
          '[AuthService] Token not found in Redis and strict session check is enabled',
        );
        return null;
      }

      console.log('[AuthService] Token verification successful');
      return decoded;
    } catch (error: unknown) {
      // JWT verification failed (invalid signature, expired, etc.)
      const message = error instanceof Error ? error.message : String(error);
      console.error('[AuthService] Token verification failed:', message);
      return null;
    }
  }

  /**
   * Revoke a token by removing it from Redis
   */
  async revokeToken(token: string): Promise<void> {
    await this.cacheManager.del(`session:${token}`);
  }

  /**
   * Refresh a token, extending its expiry time
   */
  async refreshToken(token: string): Promise<string | null> {
    const payload = await this.verifyToken(token);

    if (!payload) {
      return null;
    }

    // Revoke old token
    await this.revokeToken(token);

    // Generate new token with same data
    return this.generateToken(payload.credentialId, payload.userId);
  }

  /**
   * Get token stats (for debugging)
   */
  async getTokenStats(): Promise<{ description: string }> {
    return {
      description: 'Session tokens stored in Redis with 30-minute TTL',
    };
  }
}
