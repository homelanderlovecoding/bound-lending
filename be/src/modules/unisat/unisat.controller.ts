import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UnisatService } from './unisat.service';

@ApiTags('unisat')
@Controller('api/unisat')
export class UnisatController {
  constructor(private readonly unisatService: UnisatService) {}

  @Get('balance/rune')
  @ApiOperation({ summary: 'Get on-chain Rune balance for an address (UniSat indexer)' })
  @ApiQuery({ name: 'address', required: true, type: String })
  @ApiQuery({ name: 'runeId', required: false, type: String, description: 'Defaults to bUSD rune' })
  async getRuneBalance(
    @Query('address') address: string,
    @Query('runeId') runeId?: string,
  ) {
    return this.unisatService.getRuneBalance(address, runeId);
  }

  @Get('balance/btc')
  @ApiOperation({ summary: 'Get on-chain BTC balance for an address (UniSat indexer)' })
  @ApiQuery({ name: 'address', required: true, type: String })
  async getBtcBalance(@Query('address') address: string) {
    const satoshi = await this.unisatService.getBtcBalance(address);
    return { address, satoshi, btc: satoshi / 1e8 };
  }
}
