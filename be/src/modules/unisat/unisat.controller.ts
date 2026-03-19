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

  @Get('balance')
  @ApiOperation({ summary: 'Get full balance (BTC + bUSD Rune) + current block height' })
  @ApiQuery({ name: 'address', required: true, type: String })
  async getBalance(@Query('address') address: string) {
    const [btcSatoshi, busd, blockInfo] = await Promise.all([
      this.unisatService.getBtcBalance(address),
      this.unisatService.getBusdBalance(address),
      this.unisatService.getBlockchainInfo(),
    ]);

    return {
      address,
      blockHeight: blockInfo.blockHeight,
      blockHash: blockInfo.blockHash,
      btc: {
        satoshi: btcSatoshi,
        amount: btcSatoshi / 1e8,
      },
      busd: {
        runeId: busd.runeId,
        amount: busd.amount,
        amountRaw: busd.amountRaw,
        divisibility: busd.divisibility,
      },
    };
  }

  @Get('blockchain/info')
  @ApiOperation({ summary: 'Get current block height and chain info' })
  async getBlockchainInfo() {
    return this.unisatService.getBlockchainInfo();
  }
}
