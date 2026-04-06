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

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([
      User,
      PasskeyCredential,
      PointsTransaction,
      AiUsageLog,
      ChanceTransaction,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
