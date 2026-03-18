import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { LoanModule } from '../loan/loan.module';

@Module({
  imports: [LoanModule],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
