import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { User } from '../user/entities/user.entity';
import { AiUsageLog } from '../points/entities/ai-usage-log.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AiUsageLog, PointsTransaction, Conversation, Message]),
    AuthModule,
    UserModule,
  ],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
