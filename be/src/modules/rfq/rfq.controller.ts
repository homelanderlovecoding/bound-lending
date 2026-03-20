import { Controller, Post, Get, Delete, Body, Param, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { RfqService } from './rfq.service';
import { PriceFeedService } from '../price-feed/price-feed.service';
import { LoanService } from '../loan/loan.service';
import { UserService } from '../user/user.service';
import { CreateRfqDto, SubmitOfferDto, AcceptOfferDto } from './dto/rfq.dto';

@ApiTags('RFQ')
@ApiBearerAuth()
@Controller('rfqs')
export class RfqController extends GeneralController {
  constructor(
    private readonly rfqService: RfqService,
    private readonly priceFeedService: PriceFeedService,
    private readonly loanService: LoanService,
    private readonly userService: UserService,
  ) {
    super();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new RFQ (borrower)' })
  async createRfq(@Body() dto: CreateRfqDto, @Req() req: { user: { userId: string } }) {
    const btcPrice = await this.priceFeedService.getBtcPrice();
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
  @ApiOperation({ summary: 'Accept an offer (borrower) — creates loan in ORIGINATION_PENDING state' })
  async acceptOffer(
    @Param('id') rfqId: string,
    @Body() dto: AcceptOfferDto,
    @Req() req: { user: { userId: string } },
  ) {
    // 1. Update RFQ status → SELECTED
    const rfq = await this.rfqService.acceptOffer(rfqId, dto.offerId, req.user.userId);

    // 2. Resolve accepted offer
    const acceptedOffer = rfq.offers.find((o) => o._id.toString() === dto.offerId);
    if (!acceptedOffer) return this.response({ data: { rfq } });

    // 3. Fetch borrower + lender pubkeys from user records
    const [borrower, lender] = await Promise.all([
      this.userService.findById(req.user.userId),
      this.userService.findById(acceptedOffer.lender.toString()),
    ]);

    if (!borrower?.pubkey || !lender?.pubkey) {
      return this.response({ data: { rfq, error: 'Missing pubkey — connect wallet to complete' } });
    }

    // 4. Get current BTC price for loan terms
    const btcPrice = await this.priceFeedService.getBtcPrice();

    // 5. Create loan
    const loan = await this.loanService.createFromRfq({
      rfqId,
      borrowerId: req.user.userId,
      lenderId: acceptedOffer.lender.toString(),
      borrowerPubkey: borrower.pubkey,
      lenderPubkey: lender.pubkey,
      collateralBtc: rfq.collateralBtc,
      amountUsd: rfq.amountUsd,
      termDays: rfq.termDays,
      rateApr: acceptedOffer.rateApr,
      btcPrice,
    });

    return this.response({ data: { rfq, loan, loanId: loan._id.toString() } });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel RFQ (borrower)' })
  async cancelRfq(@Param('id') rfqId: string, @Req() req: { user: { userId: string } }) {
    const rfq = await this.rfqService.cancelRfq(rfqId, req.user.userId);
    return this.response({ data: rfq });
  }
}
