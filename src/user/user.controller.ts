import { Controller, Get, Headers, Logger } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import { User } from './entities/user.entity';

@Controller('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Extract credential ID from auth header
   */
  private async getCredentialId(authHeader: string): Promise<string | null> {
    if (!authHeader) return null;

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;

    const token = parts[1];
    const payload = await this.authService.verifyToken(token);
    return payload?.credentialId || null;
  }

  /**
   * Get user profile
   */
  @Get('profile')
  async getProfile(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return null;
    }

    const user = await this.userService.getUserByCredentialId(credentialId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      inviteCode: user.inviteCode,
      invitedBy: user.invitedBy,
      ninjaBalance: Number(user.ninjaBalance),
      chanceRemaining: Number((user as User & { chanceRemaining?: number }).chanceRemaining ?? 0),
      chanceCooldownEndsAt: Number((user as User & { chanceCooldownEndsAt?: number }).chanceCooldownEndsAt ?? 0),
      createdAt: user.createdAt,
    };
  }
}
