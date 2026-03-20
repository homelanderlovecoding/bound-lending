import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiProperty({ description: 'Signed message (base64)' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ description: 'Challenge nonce' })
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @ApiPropertyOptional({ description: 'Compressed public key hex (33 bytes)' })
  @IsOptional()
  @IsString()
  publicKey?: string;
}

export class RefreshRequestDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
