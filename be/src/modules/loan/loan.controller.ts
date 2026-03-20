import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { Public } from '../../decorators/public.decorator';
import { LoanService } from './loan.service';
import { LoanSigningService } from './loan-signing.service';
import { SignPsbtDto, LoanQueryDto } from './dto/loan.dto';

@ApiTags('Loans')
@ApiBearerAuth()
@Controller('loans')
export class LoanController extends GeneralController {
  constructor(
    private readonly loanService: LoanService,
    private readonly loanSigningService: LoanSigningService,
  ) {
    super();
  }

  @Public()
  @Get('active')
  @ApiOperation({ summary: 'All platform-wide active loans (public)' })
  async getActiveLoans() {
    const loans = await this.loanService.getAllActiveLoans();
    return this.response({ data: loans });
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List my loans (filter by role, status) — returns empty if unauthenticated' })
  async getLoans(@Query() query: LoanQueryDto, @Req() req: { user?: { userId: string } }) {
    if (!req.user?.userId) return this.response({ data: [] });
    const loans = await this.loanService.getLoansByUser(req.user.userId, query.role);
    return this.response({ data: loans });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan details' })
  async getLoan(@Param('id') id: string) {
    const loan = await this.loanService.findByIdOrThrow(id);
    return this.response({ data: loan });
  }

  @Get(':id/repayment-quote')
  @ApiOperation({ summary: 'Get repayment quote (principal + accrued interest)' })
  async getRepaymentQuote(@Param('id') id: string) {
    const loan = await this.loanService.findByIdOrThrow(id);
    const quote = this.loanService.calculateRepaymentAmount(loan);
    return this.response({ data: quote });
  }

  @Get(':id/psbt/origination')
  @ApiOperation({ summary: 'Get (or build) the unsigned origination PSBT for a loan' })
  async getOriginationPsbt(@Param('id') loanId: string) {
    const loan = await this.loanService.findByIdOrThrow(loanId);

    let psbtHex = (loan as any).originationPsbt;
    if (!psbtHex) {
      psbtHex = await this.loanSigningService.buildAndStoreOriginationPsbt(loanId);
    }

    return this.response({ data: { loanId, psbtHex } });
  }

  @Post(':id/psbt/origination/sign')
  @ApiOperation({ summary: 'Submit borrower or lender signature for origination PSBT' })
  async signOrigination(
    @Param('id') loanId: string,
    @Body() dto: SignPsbtDto,
    @Req() req: { user: { userId: string; roles: string[] } },
  ) {
    const loan = await this.loanService.findByIdOrThrow(loanId);
    const party = loan.borrower.toString() === req.user.userId ? 'borrower' : 'lender';
    const result = await this.loanSigningService.recordOriginationSignature(loanId, party, dto.signedPsbtHex);
    return this.response({ data: result });
  }

  @Get(':id/psbt/repay')
  @ApiOperation({ summary: 'Get repayment PSBT (pre-signed by Bound, borrower signs and submits)' })
  async getRepaymentPsbt(@Param('id') loanId: string) {
    const psbtHex = await this.loanSigningService.buildRepaymentPsbt(loanId);
    return this.response({ data: { loanId, psbtHex } });
  }

  @Post(':id/psbt/repay/sign')
  @ApiOperation({ summary: 'Submit borrower-signed repayment PSBT — finalizes and broadcasts' })
  async signRepayment(
    @Param('id') loanId: string,
    @Body() dto: SignPsbtDto,
  ) {
    const txid = await this.loanSigningService.finalizeRepayment(loanId, dto.signedPsbtHex);
    return this.response({ data: { loanId, txid, status: 'repaid' } });
  }

  @Post(':id/forfeit')
  @ApiOperation({ summary: 'Execute forfeiture (Bound+Lender, post-default only)' })
  async requestForfeiture(@Param('id') loanId: string) {
    const txid = await this.loanSigningService.executeForfeiture(loanId);
    return this.response({ data: { loanId, txid, status: 'forfeited' } });
  }
}
