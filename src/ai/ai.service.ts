import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { POINTS_CONFIG } from '../config/points.config';
import { ChatRecordRequest } from './dto/chat-record.dto';
import { UserService } from '../user/user.service';

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  tool_use?: any[];
  tool_result?: any[];
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepository: Repository<AiUsageLog>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly userService: UserService,
  ) {}

  /**
   * Calculate AI cost in NINJIA
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = POINTS_CONFIG.AI.MODELS[model];
    if (!pricing) {
      this.logger.warn(`Unknown model: ${model}, using default pricing`);
      return 0;
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    return totalCost * POINTS_CONFIG.AI.NINJIA_PER_DOLLAR;
  }

  /**
   * Record chat from frontend (frontend executes tools, backend records and charges)
   */
  async recordChat(
    credentialId: string,
    request: ChatRecordRequest,
  ): Promise<{
    ok: boolean;
    conversationId: string;
    balance: number;
    cost?: {
      inputTokens: number;
      outputTokens: number;
      ninjiaDeducted: number;
      currency: number;
    };
    error?: string;
    current?: number;
    required?: number;
  }> {
    // Get user
    const user = await this.userService.ensureUserExists(credentialId);

    // Validate user
    if (!user || !user.id) {
      this.logger.error(`Failed to ensure user exists: credentialId=${credentialId}`);
      return {
        ok: false,
        conversationId: request.conversationId || '',
        balance: 0,
        error: 'User not found or creation failed',
      };
    }

    // Calculate cost
    const inputTokens = request.usage.inputTokens || 0;
    const outputTokens = request.usage.outputTokens || 0;
    const cost = this.calculateCost(request.model, inputTokens, outputTokens);
    const currentBalance = Number(user.ninjiaBalance);

    // Check balance
    if (currentBalance < cost) {
      return {
        ok: false,
        conversationId: request.conversationId || '',
        balance: currentBalance,
        error: 'INSUFFICIENT_NINJA',
        current: currentBalance,
        required: cost,
      };
    }

    // Deduct cost
    const newBalance = currentBalance - cost;
    user.ninjiaBalance = newBalance;
    await this.userRepository.save(user);

    // Generate conversation ID
    const conversationId = request.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Record AI usage
    try {
      await this.aiUsageLogRepository.save({
        userId: user.id,
        model: request.model,
        inputTokens,
        outputTokens,
        costNinjia: cost,
        conversationId,
      });
    } catch (error) {
      this.logger.error(`Failed to save AI usage log: ${error.message}`);
      throw error;
    }

    // Save conversation
    await this.saveConversation(
      credentialId,
      conversationId,
      request.title,
      request.messages,
      request.model,
    );

    this.logger.log(
      `Chat recorded: user=${user.id}, ${inputTokens} in, ${outputTokens} out, ${cost} NINJIA charged, balance: ${newBalance}`,
    );

    return {
      ok: true,
      conversationId,
      balance: newBalance,
      cost: {
        inputTokens,
        outputTokens,
        ninjiaDeducted: cost,
        currency: cost / POINTS_CONFIG.AI.NINJIA_PER_DOLLAR,
      },
    };
  }

  /**
   * Sync conversation body to backend
   */
  async syncConversation(
    credentialId: string,
    conversationId: string,
    messages: AIMessage[],
  ): Promise<{ success: boolean }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { success: false };
    }

    // Find or create conversation
    let conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      conversation = this.conversationRepository.create({
        id: conversationId,
        credentialId,
        title: messages[0]?.content?.substring(0, 50) || 'New Chat',
        model: null,
      });
      await this.conversationRepository.save(conversation);
    }

    // Clear existing messages and insert new ones
    await this.messageRepository.delete({ conversationId });

    // Insert new messages
    for (const msg of messages) {
      await this.messageRepository.save({
        conversationId,
        role: msg.role,
        content: msg.content || '',
        toolUse: msg.tool_use || null,
        toolResult: msg.tool_result || null,
      });
    }

    // Update conversation timestamp
    conversation.updatedAt = new Date();
    await this.conversationRepository.save(conversation);

    return { success: true };
  }

  /**
   * Get conversation list
   */
  async getConversations(credentialId: string): Promise<Conversation[]> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return [];
    }

    return this.conversationRepository.find({
      where: { credentialId },
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Get conversation by ID
   */
  async getConversation(credentialId: string, conversationId: string): Promise<{
    conversation: Conversation;
    messages: Message[];
  } | null> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return null;
    }

    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, credentialId },
    });

    if (!conversation) {
      return null;
    }

    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    return { conversation, messages };
  }

  /**
   * Delete conversation
   */
  async deleteConversation(
    credentialId: string,
    conversationId: string,
  ): Promise<{ success: boolean }> {
    const user = await this.userRepository.findOne({
      where: { credentialId },
    });

    if (!user) {
      return { success: false };
    }

    const result = await this.conversationRepository.delete({
      id: conversationId,
      credentialId,
    });

    return { success: (result.affected ?? 0) > 0 };
  }

  /**
   * Save conversation to database
   */
  private async saveConversation(
    credentialId: string,
    conversationId: string,
    title: string | undefined,
    messages: ChatRecordRequest['messages'],
    model: string,
  ): Promise<void> {
    try {
      let conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });

      if (!conversation) {
        conversation = this.conversationRepository.create({
          id: conversationId,
          credentialId,
          title: title || messages[0]?.content?.substring(0, 50) || 'New Chat',
          model,
        });
        await this.conversationRepository.save(conversation);
      }

      // Clear old messages
      await this.messageRepository.delete({ conversationId });

      // Save new messages
      for (const msg of messages) {
        try {
          await this.messageRepository.save({
            conversationId,
            role: msg.role,
            content: msg.content || '',
            toolUse: msg.tool_use || null,
            toolResult: msg.tool_result || null,
          });
        } catch (error) {
          this.logger.error(`Failed to save message for conversation ${conversationId}: ${error.message}`);
          throw error;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to save conversation ${conversationId}: ${error.message}`);
      throw error;
    }
  }
}
