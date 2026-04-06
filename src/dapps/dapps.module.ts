import { Module } from '@nestjs/common';
import { DappsController } from './dapps.controller';
import { DappsService } from './dapps.service';

@Module({
  controllers: [DappsController],
  providers: [DappsService],
  exports: [DappsService],
})
export class DappsModule {}
