import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { User } from '../user/entities/user.entity';
import { ReferralLog } from './entities/referral-log.entity';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { PasskeyCredential } from '../passkey/entities/credential.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ReferralLog, PasskeyCredential]),
    UserModule,
    AuthModule,
  ],
  controllers: [ReferralController],
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}
