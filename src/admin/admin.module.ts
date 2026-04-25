import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../user/entities/user.entity';
import { PasskeyCredential } from '../passkey/entities/credential.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';
import { ChanceTransaction } from '../chance/entities/chance-transaction.entity';
import { UserModule } from '../user/user.module';
import { Conversation } from '../ai/entities/conversation.entity';
import { Message } from '../ai/entities/message.entity';
import { AgentSessionEntity } from '../ai/entities/agent-session.entity';
import { AgentToolLogEntity } from '../ai/entities/agent-tool-log.entity';

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([
      User,
      PasskeyCredential,
      PointsTransaction,
      AiUsageLog,
      ChanceTransaction,
      Conversation,
      Message,
      AgentSessionEntity,
      AgentToolLogEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
