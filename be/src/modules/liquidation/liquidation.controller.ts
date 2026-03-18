import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { LiquidationService } from './liquidation.service';

@ApiTags('Internal')
@ApiBearerAuth()
@Controller('internal')
export class LiquidationController extends GeneralController {
  constructor(private readonly liquidationService: LiquidationService) {
    super();
  }

  @Get('review-queue')
  @ApiOperation({ summary: 'Loans pending manual review (≥0.20 BTC)' })
  async getReviewQueue() {
    // TODO: query loans with requiresManualReview + in-danger state
    return this.response({ data: [] });
  }

  @Post('review-queue/:id/approve')
  @ApiOperation({ summary: 'Approve liquidation/forfeiture' })
  async approveReview(@Param('id') loanId: string) {
    await this.liquidationService.executeLiquidation(loanId);
    return this.response({ data: { loanId, status: 'approved' } });
  }

  @Post('review-queue/:id/reject')
  @ApiOperation({ summary: 'Reject liquidation with reason' })
  async rejectReview(@Param('id') loanId: string) {
    // TODO: record rejection reason, clear in-danger flag
    return this.response({ data: { loanId, status: 'rejected' } });
  }

  @Get('price-feeds')
  @ApiOperation({ summary: 'Current price feed status' })
  async getPriceFeedStatus() {
    const result = await this.liquidationService.executeOracleCheck('diagnostic');
    return this.response({ data: result });
  }
}
