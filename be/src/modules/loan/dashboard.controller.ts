import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { LoanService } from './loan.service';
import { ELoanState } from '../../database/entities';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController extends GeneralController {
  constructor(private readonly loanService: LoanService) {
    super();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard summary (active loans, totals)' })
  async getSummary(@Req() req: { user: { userId: string } }) {
    const borrowerLoans = await this.loanService.getLoansByUser(req.user.userId, 'borrower');
    const lenderLoans = await this.loanService.getLoansByUser(req.user.userId, 'lender');

    const activeStates = [ELoanState.ACTIVE, ELoanState.GRACE];
    const activeAsBorrower = borrowerLoans.filter((l) => activeStates.includes(l.state));
    const activeAsLender = lenderLoans.filter((l) => activeStates.includes(l.state));

    const totalBorrowed = activeAsBorrower.reduce((sum, l) => sum + l.terms.principalUsd, 0);
    const totalLent = activeAsLender.reduce((sum, l) => sum + l.terms.principalUsd, 0);

    return this.response({
      data: {
        activeLoanCount: activeAsBorrower.length + activeAsLender.length,
        totalBorrowed,
        totalLent,
        atRiskLoans: [...activeAsBorrower, ...activeAsLender].filter(
          (l) => l.liquidation?.lastLtv && l.liquidation.lastLtv >= 80,
        ).length,
      },
    });
  }

  @Get('loans')
  @ApiOperation({ summary: 'Paginated loan list for dashboard' })
  async getLoans(@Req() req: { user: { userId: string } }) {
    const loans = await this.loanService.getLoansByUser(req.user.userId);
    return this.response({ data: loans });
  }
}
