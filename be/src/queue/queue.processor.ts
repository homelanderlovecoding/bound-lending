import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_REGISTER } from '../commons/constants';
import { IRedisConfig, IPriceFeedConfig } from '../commons/types';
import { LiquidationService } from '../modules/liquidation/liquidation.service';
import { IndexerService } from '../modules/indexer/indexer.service';

/**
 * Manages recurring background jobs.
 * Uses setInterval for MVP — swap for BullMQ repeatable jobs in production.
 */
@Injectable()
export class QueueProcessor implements OnModuleInit {
  private readonly logger = new Logger(QueueProcessor.name);
  private readonly priceFeedConfig: IPriceFeedConfig;

  constructor(
    private readonly liquidationService: LiquidationService,
    private readonly indexerService: IndexerService,
    private readonly configService: ConfigService,
  ) {
    this.priceFeedConfig = this.configService.get<IPriceFeedConfig>(ENV_REGISTER.PRICE_FEED)!;
  }

  onModuleInit(): void {
    this.startPricePolling();
    this.startChainPolling();
    this.startExpiryChecks();
    this.logger.log('Queue processor initialized');
  }

  /** Poll price feeds + scan LTV every 60s */
  private startPricePolling(): void {
    setInterval(async () => {
      try {
        const results = await this.liquidationService.scanAllLoans();
        if (results.length > 0) {
          this.logger.log(`LTV scan: ${results.length} loans flagged`);
        }
      } catch (error) {
        this.logger.error('Price poll failed', error);
      }
    }, this.priceFeedConfig.intervalMs);
  }

  /** Poll chain for funding/repayment every 10s */
  private startChainPolling(): void {
    setInterval(async () => {
      try {
        await this.indexerService.pollWatchedAddresses();
        await this.indexerService.checkPendingFunding();
      } catch (error) {
        this.logger.error('Chain poll failed', error);
      }
    }, 10_000);
  }

  /** Check term/grace expiry every 60s */
  private startExpiryChecks(): void {
    setInterval(async () => {
      try {
        await this.indexerService.checkLoanExpiry();
      } catch (error) {
        this.logger.error('Expiry check failed', error);
      }
    }, 60_000);
  }
}
