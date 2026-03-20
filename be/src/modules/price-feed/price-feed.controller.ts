import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { GeneralController } from '../../commons/base-module';
import { Public } from '../../decorators/public.decorator';
import { ENV_REGISTER } from '../../commons/constants';
import { ILendingConfig } from '../../commons/types';
import { PriceFeedService } from './price-feed.service';

@ApiTags('API')
@Controller('api')
export class PriceFeedController extends GeneralController {
  constructor(
    private readonly priceFeedService: PriceFeedService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  @Public()
  @Get('price/btc')
  @ApiOperation({ summary: 'Get current BTC price' })
  async getBtcPrice() {
    const price = await this.priceFeedService.getBtcPrice();
    return this.response({ data: { price, currency: 'USD' } });
  }

  @Public()
  @Get('config/lending')
  @ApiOperation({ summary: 'Get lending configuration parameters' })
  getLendingConfig() {
    const config = this.configService.get<ILendingConfig>(ENV_REGISTER.LENDING);
    return this.response({ data: config });
  }
}
