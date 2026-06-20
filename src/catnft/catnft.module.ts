import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatnftService } from './catnft.service';
import { CatnftController } from './catnft.controller';
import { CatAssetBatch } from './entities/cat-asset-batch.entity';
import { CatMetadataItem } from './entities/cat-metadata-item.entity';
import { CatMintRecord } from './entities/cat-mint-record.entity';
import { MintCreditLedger } from './entities/mint-credit-ledger.entity';
import { User } from '../user/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatAssetBatch,
      CatMetadataItem,
      CatMintRecord,
      MintCreditLedger,
      User,
    ]),
    AuthModule,
    UserModule,
  ],
  controllers: [CatnftController],
  providers: [CatnftService],
  exports: [CatnftService],
})
export class CatnftModule {}
