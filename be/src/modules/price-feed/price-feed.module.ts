import { Module } from '@nestjs/common';
import { PriceFeedService } from './price-feed.service';
import { PriceFeedController } from './price-feed.controller';

@Module({
  controllers: [PriceFeedController],
  providers: [PriceFeedService],
  exports: [PriceFeedService],
})
export class PriceFeedModule {}
