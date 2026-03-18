import { Controller, Post, Get, Delete, Body, Param, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { RfqService } from './rfq.service';
import { CreateRfqDto, SubmitOfferDto, AcceptOfferDto } from './dto/rfq.dto';

@ApiTags('RFQ')
@ApiBearerAuth()
@Controller('rfqs')
export class RfqController extends GeneralController {
  constructor(private readonly rfqService: RfqService) {
    super();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new RFQ (borrower)' })
  async createRfq(@Body() dto: CreateRfqDto, @Req() req: { user: { userId: string } }) {
    // TODO: Get real BTC price from price feed service
    const btcPrice = 91183.76;
    const rfq = await this.rfqService.createRfq({
      borrowerId: req.user.userId,
      collateralBtc: dto.collateralBtc,
      amountUsd: dto.amountUsd,
      termDays: dto.termDays,
      btcPrice,
    });
    return this.response({ data: rfq });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get RFQ details + offers' })
  async getRfq(@Param('id') id: string) {
    const rfq = await this.rfqService.findByIdOrThrow(id);
    return this.response({ data: rfq });
  }

  @Post(':id/offers')
  @ApiOperation({ summary: 'Submit offer to RFQ (lender)' })
  async submitOffer(
    @Param('id') rfqId: string,
    @Body() dto: SubmitOfferDto,
    @Req() req: { user: { userId: string } },
  ) {
    const rfq = await this.rfqService.submitOffer({
      rfqId,
      lenderId: req.user.userId,
      lenderPubkey: dto.lenderPubkey,
      rateApr: dto.rateApr,
    });
    return this.response({ data: rfq });
  }

  @Delete(':id/offers/:offerId')
  @ApiOperation({ summary: 'Withdraw offer (lender)' })
  async withdrawOffer(
    @Param('id') rfqId: string,
    @Param('offerId') offerId: string,
    @Req() req: { user: { userId: string } },
  ) {
    const rfq = await this.rfqService.withdrawOffer(rfqId, offerId, req.user.userId);
    return this.response({ data: rfq });
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an offer (borrower)' })
  async acceptOffer(
    @Param('id') rfqId: string,
    @Body() dto: AcceptOfferDto,
    @Req() req: { user: { userId: string } },
  ) {
    const rfq = await this.rfqService.acceptOffer(rfqId, dto.offerId, req.user.userId);
    return this.response({ data: rfq });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel RFQ (borrower)' })
  async cancelRfq(@Param('id') rfqId: string, @Req() req: { user: { userId: string } }) {
    const rfq = await this.rfqService.cancelRfq(rfqId, req.user.userId);
    return this.response({ data: rfq });
  }
}
