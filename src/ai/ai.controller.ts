import { Controller, Get, Post, Delete, Body, Headers, Param, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { AIService } from './ai.service';
import { AuthService } from '../auth/auth.service';
import { ChatRecordRequest } from './dto/chat-record.dto';

interface SyncConversationRequest {
  conversationId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly aiService: AIService,
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
   * Record chat from frontend (frontend executes tools, backend records and charges)
   */
  @Post('chat/record')
  @UsePipes(new ValidationPipe({ transform: true }))
  async recordChat(
    @Headers('authorization') authHeader: string,
    @Body() dto: ChatRecordRequest,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { ok: false, error: 'Unauthorized' };
    }

    try {
      return await this.aiService.recordChat(credentialId, dto);
    } catch (error) {
      this.logger.error(`Record chat failed: ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Sync conversation body to backend
   */
  @Post('sync-body')
  async syncConversation(
    @Headers('authorization') authHeader: string,
    @Body() dto: SyncConversationRequest,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await this.aiService.syncConversation(
        credentialId,
        dto.conversationId,
        dto.messages,
      );

      return result;
    } catch (error) {
      this.logger.error(`Sync conversation failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get conversation list
   */
  @Get('conversations')
  async getConversations(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return [];
    }

    return this.aiService.getConversations(credentialId);
  }

  /**
   * Get conversation by ID
   */
  @Get('conversations/:id')
  async getConversation(
    @Headers('authorization') authHeader: string,
    @Param('id') conversationId: string,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return null;
    }

    return this.aiService.getConversation(credentialId, conversationId);
  }

  /**
   * Delete conversation
   */
  @Delete('conversations/:id')
  async deleteConversation(
    @Headers('authorization') authHeader: string,
    @Param('id') conversationId: string,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      return { success: false, error: 'Unauthorized' };
    }

    return this.aiService.deleteConversation(credentialId, conversationId);
  }
}
