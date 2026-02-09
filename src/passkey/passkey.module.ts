import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasskeyController } from './passkey.controller';
import { PasskeyService } from './passkey.service';
import { ChallengeStorageService } from './challenge-storage.service';
import { PasskeyCredential } from './entities/credential.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([PasskeyCredential]), AuthModule],
  controllers: [PasskeyController],
  providers: [PasskeyService, ChallengeStorageService],
  exports: [PasskeyService],
})
export class PasskeyModule {}
