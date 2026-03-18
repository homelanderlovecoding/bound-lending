import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChallengeRequestDto {
  @ApiProperty({ description: 'Bitcoin address (Trading Wallet)' })
  @IsString()
  @IsNotEmpty()
  address: string;
}

export class VerifyRequestDto {
  @ApiProperty({ description: 'Bitcoin address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'Signed message (hex)' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'Challenge nonce' })
  @IsString()
  @IsNotEmpty()
  nonce: string;
}

export class RefreshRequestDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
