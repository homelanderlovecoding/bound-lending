import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GeneralController } from '../../commons/base-module';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { ChallengeRequestDto, VerifyRequestDto, RefreshRequestDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController extends GeneralController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {
    super();
  }

  @Post('challenge')
  @ApiOperation({ summary: 'Request a signing challenge' })
  async challenge(@Body() dto: ChallengeRequestDto) {
    const result = this.authService.generateChallenge(dto.address);
    return this.response({ data: result });
  }

  @Post('verify')
  @ApiOperation({ summary: 'Submit signed challenge and get JWT' })
  async verify(@Body() dto: VerifyRequestDto) {
    // Find or create user
    const user = await this.userService.findOrCreateByAddress(dto.address);

    const tokens = await this.authService.verifyAndIssueTokens(
      { address: dto.address, signature: dto.signature, nonce: dto.nonce },
      user._id.toString(),
      user.roles,
    );

    return this.response({ data: tokens });
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshRequestDto) {
    const tokens = await this.authService.refreshAccessToken(dto.refreshToken);
    return this.response({ data: tokens });
  }
}
