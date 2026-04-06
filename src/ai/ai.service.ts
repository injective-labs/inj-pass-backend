import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
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

  private resolvePricingModel(requestedModel: string): {
    billableModel: string;
    pricing: { input: number; output: number };
  } {
    const directPricing = POINTS_CONFIG.AI.MODELS[requestedModel];
    if (directPricing) {
      return {
        billableModel: requestedModel,
        pricing: directPricing,
      };
    }

    const aliasedModel = POINTS_CONFIG.AI.MODEL_ALIASES[requestedModel];
    if (aliasedModel) {
      const aliasedPricing = POINTS_CONFIG.AI.MODELS[aliasedModel];
      if (aliasedPricing) {
        this.logger.warn(
          `Unknown model alias: ${requestedModel}, billing as ${aliasedModel}`,
        );
        return {
          billableModel: aliasedModel,
          pricing: aliasedPricing,
        };
      }
    }

    const fallbackModel = POINTS_CONFIG.AI.DEFAULT_MODEL;
    const fallbackPricing = POINTS_CONFIG.AI.MODELS[fallbackModel];

    this.logger.warn(
      `Unknown model: ${requestedModel}, billing as default ${fallbackModel}`,
    );

    return {
      billableModel: fallbackModel,
      pricing: fallbackPricing,
    };
  }

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AiUsageLog)
    private readonly aiUsageLogRepository: Repository<AiUsageLog>,
    @InjectRepository(PointsTransaction)
    private readonly pointsTransactionRepository: Repository<PointsTransaction>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly userService: UserService,
  ) {}

  /**
   * Calculate AI cost in NINJA
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): {
    costNinja: number;
    billableModel: string;
  } {
    const { pricing, billableModel } = this.resolvePricingModel(model);

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    return {
      costNinja: totalCost * POINTS_CONFIG.AI.NINJA_PER_DOLLAR,
      billableModel,
    };
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
      ninjaDeducted: number;
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
      this.logger.error(
        `Failed to ensure user exists: credentialId=${credentialId}`,
      );
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
    const { costNinja: cost, billableModel } = this.calculateCost(
      request.model,
      inputTokens,
      outputTokens,
    );
    const currentBalance = Number(user.ninjaBalance);

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

    // Generate conversation ID
    const conversationId =
      request.conversationId ||
      `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Deduct cost
    const newBalance = currentBalance - cost;
    user.ninjaBalance = newBalance;
    await this.userRepository.save(user);

    if (cost > 0) {
      await this.pointsTransactionRepository.save({
        userId: user.id,
        type: 'ai_spent',
        amount: -cost,
        balanceAfter: newBalance,
        metadata: {
          conversationId,
          model: request.model,
          billableModel,
          inputTokens,
          outputTokens,
        },
      });
    }

    // Record AI usage
    try {
      await this.aiUsageLogRepository.save({
        userId: user.id,
        model: request.model,
        inputTokens,
        outputTokens,
        costNinja: cost,
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
      `Chat recorded: user=${user.id}, model=${request.model}, billedAs=${billableModel}, ${inputTokens} in, ${outputTokens} out, ${cost} NINJIA charged, balance: ${newBalance}`,
    );

    return {
      ok: true,
      conversationId,
      balance: newBalance,
      cost: {
        inputTokens,
        outputTokens,
        ninjaDeducted: cost,
        currency: cost / POINTS_CONFIG.AI.NINJA_PER_DOLLAR,
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
  async getConversation(
    credentialId: string,
    conversationId: string,
  ): Promise<{
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
          this.logger.error(
            `Failed to save message for conversation ${conversationId}: ${error.message}`,
          );
          throw error;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to save conversation ${conversationId}: ${error.message}`,
      );
      throw error;
    }
  }
}
