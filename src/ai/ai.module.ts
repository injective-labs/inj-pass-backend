import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { User } from '../user/entities/user.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { AgentSessionEntity } from './entities/agent-session.entity';
import { AgentToolLogEntity } from './entities/agent-tool-log.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { AgentsModule } from './agents/agents.module';
import { DappsModule } from '../dapps/dapps.module';
import { AgentSessionService } from './agent-session.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentToolLogService } from './agent-tool-log.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SandboxWalletService } from './sandbox-wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AiUsageLog,
      PointsTransaction,
      Conversation,
      Message,
      AgentSessionEntity,
      AgentToolLogEntity,
    ]),
    AuthModule,
    UserModule,
    AgentsModule,
    DappsModule,
  ],
  controllers: [AIController],
  providers: [
    AIService,
    AgentSessionService,
    AgentOrchestratorService,
    AgentToolLogService,
    PromptBuilderService,
    SandboxWalletService,
  ],
  exports: [AIService],
})
export class AIModule {}
