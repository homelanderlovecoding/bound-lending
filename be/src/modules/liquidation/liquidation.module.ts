import { Module } from '@nestjs/common';
import { LiquidationService } from './liquidation.service';
import { LiquidationController } from './liquidation.controller';
import { LoanModule } from '../loan/loan.module';
import { PriceFeedModule } from '../price-feed/price-feed.module';

@Module({
  imports: [LoanModule, PriceFeedModule],
  controllers: [LiquidationController],
  providers: [LiquidationService],
  exports: [LiquidationService],
})
export class LiquidationModule {}
