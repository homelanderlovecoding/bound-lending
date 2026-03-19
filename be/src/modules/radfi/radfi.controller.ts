import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RadFiService } from './radfi.service';
import { IRadFiBalanceResult } from './radfi.type';

@ApiTags('radfi')
@Controller('api/radfi')
export class RadFiController {
  constructor(private readonly radFiService: RadFiService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get BTC + bUSD balance for a Trading Wallet address' })
  @ApiQuery({ name: 'address', required: true, type: String })
  async getBalance(@Query('address') address: string): Promise<IRadFiBalanceResult> {
    return this.radFiService.getWalletBalance(address);
  }
}
