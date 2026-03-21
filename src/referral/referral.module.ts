import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { User } from '../user/entities/user.entity';
import { ReferralLog } from './entities/referral-log.entity';
import { PointsTransaction } from '../points/entities/points-transaction.entity';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ReferralLog, PointsTransaction]),
    UserModule,
    AuthModule,
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
