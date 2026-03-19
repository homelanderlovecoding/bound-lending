import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';
import { LoanModule } from '../loan/loan.module';
import { UnisatModule } from '../unisat/unisat.module';

@Module({
  imports: [LoanModule, UnisatModule],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
