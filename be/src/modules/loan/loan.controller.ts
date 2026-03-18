import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { LoanService } from './loan.service';
import { SignPsbtDto, LoanQueryDto } from './dto/loan.dto';

@ApiTags('Loans')
@ApiBearerAuth()
@Controller('loans')
export class LoanController extends GeneralController {
  constructor(private readonly loanService: LoanService) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'List my loans (filter by role, status)' })
  async getLoans(@Query() query: LoanQueryDto, @Req() req: { user: { userId: string } }) {
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
  @ApiOperation({ summary: 'Get repayment quote (principal + interest)' })
  async getRepaymentQuote(@Param('id') id: string) {
    const loan = await this.loanService.findByIdOrThrow(id);
    const quote = this.loanService.calculateRepaymentAmount(loan);
    return this.response({ data: quote });
  }

  @Post(':id/psbt/origination/sign')
  @ApiOperation({ summary: 'Submit borrower signature for origination PSBT' })
  async signOrigination(
    @Param('id') loanId: string,
    @Body() dto: SignPsbtDto,
    @Req() req: { user: { userId: string } },
  ) {
    // TODO: determine party from req.user vs loan.borrower/lender
    const loan = await this.loanService.recordSignature(loanId, 'borrower', dto.signedPsbtHex);
    return this.response({ data: loan });
  }

  @Post(':id/psbt/repay/sign')
  @ApiOperation({ summary: 'Submit signed repayment PSBT' })
  async signRepayment(
    @Param('id') loanId: string,
    @Body() dto: SignPsbtDto,
  ) {
    // TODO: verify PSBT, combine sigs, broadcast
    return this.response({ data: { loanId, status: 'repayment_pending' } });
  }

  @Post(':id/forfeit')
  @ApiOperation({ summary: 'Request forfeiture (lender, post-default only)' })
  async requestForfeiture(@Param('id') loanId: string) {
    // TODO: validate defaulted state, build forfeiture PSBT
    return this.response({ data: { loanId, status: 'forfeiture_requested' } });
  }
}
