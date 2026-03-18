import { Module } from '@nestjs/common';
import { QueueProcessor } from './queue.processor';
import { LiquidationModule } from '../modules/liquidation/liquidation.module';
import { IndexerModule } from '../modules/indexer/indexer.module';

@Module({
  imports: [LiquidationModule, IndexerModule],
  providers: [QueueProcessor],
})
export class QueueModule {}
