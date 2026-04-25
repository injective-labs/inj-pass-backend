import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Headers,
  Param,
  Logger,
  UsePipes,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { AIService } from './ai.service';
import { AuthService } from '../auth/auth.service';
import { ChatRecordRequest } from './dto/chat-record.dto';
import {
  AgentChatRequestDto,
  AgentClientToolResultDto,
  AgentConfirmRequestDto,
  AgentSweepRequestDto,
} from './dto/agent-chat.dto';
import { AgentOrchestratorService } from './agent-orchestrator.service';

interface SyncConversationRequest {
  conversationId: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

@Controller('ai')
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(
    private readonly aiService: AIService,
    private readonly authService: AuthService,
    private readonly agentOrchestratorService: AgentOrchestratorService,
  ) {}

  /**
   * Extract credential ID from auth header
   */
  private async getCredentialId(authHeader: string): Promise<string | null> {
    if (!authHeader) return null;

    const parts = authHeader.trim().split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

    const token = parts[1];
    try {
      const payload = await this.authService.verifyToken(token);
      return payload?.credentialId || null;
    } catch {
      return null;
    }
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
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      return await this.aiService.recordChat(credentialId, dto);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Record chat failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  @Post('agent/chat')
  @UsePipes(new ValidationPipe({ transform: true }))
  async agentChat(
    @Headers('authorization') authHeader: string,
    @Body() dto: AgentChatRequestDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      return await this.agentOrchestratorService.chat(credentialId, dto);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Agent chat failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  @Post('agent/confirm')
  @UsePipes(new ValidationPipe({ transform: true }))
  async confirmAgentAction(
    @Headers('authorization') authHeader: string,
    @Body() dto: AgentConfirmRequestDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      return await this.agentOrchestratorService.confirm(credentialId, dto);
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Agent confirm failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  @Post('agent/client-tool-result')
  @UsePipes(new ValidationPipe({ transform: true }))
  async submitClientToolResult(
    @Headers('authorization') authHeader: string,
    @Body() dto: AgentClientToolResultDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      return await this.agentOrchestratorService.submitClientToolResult(
        credentialId,
        dto,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Client tool result failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  @Post('agent/sweep')
  @UsePipes(new ValidationPipe({ transform: true }))
  async sweepSandbox(
    @Headers('authorization') authHeader: string,
    @Body() dto: AgentSweepRequestDto,
  ) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      return await this.agentOrchestratorService.sweepSandbox(
        credentialId,
        dto.conversationId,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Agent sweep failed: ${message}`);
      return { ok: false, error: message };
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
      throw new UnauthorizedException('Unauthorized');
    }

    try {
      const result = await this.aiService.syncConversation(
        credentialId,
        dto.conversationId,
        dto.messages,
      );

      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error(`Sync conversation failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Get conversation list
   */
  @Get('conversations')
  async getConversations(@Headers('authorization') authHeader: string) {
    const credentialId = await this.getCredentialId(authHeader);
    if (!credentialId) {
      throw new UnauthorizedException('Unauthorized');
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
      throw new UnauthorizedException('Unauthorized');
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
      throw new UnauthorizedException('Unauthorized');
    }

    await this.agentOrchestratorService.deleteConversationSession(conversationId);
    return this.aiService.deleteConversation(credentialId, conversationId);
  }
}
