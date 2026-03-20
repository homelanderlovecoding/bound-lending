import { IsNumber, IsString, IsNotEmpty, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRfqDto {
  @ApiProperty({ description: 'BTC collateral amount' })
  @IsNumber()
  @Min(0.0001)
  collateralBtc: number;

  @ApiProperty({ description: 'Loan amount in USD' })
  @IsNumber()
  @Min(10)
  amountUsd: number;

  @ApiProperty({ description: 'Loan term in days' })
  @IsNumber()
  @Min(1)
  termDays: number;

  @ApiPropertyOptional({ description: 'Borrower wallet BTC balance for coverage validation' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  walletBalanceBtc?: number;
}

export class SubmitOfferDto {
  @ApiProperty({ description: 'Lender public key (hex)' })
  @IsString()
  @IsNotEmpty()
  lenderPubkey: string;

  @ApiProperty({ description: 'Annual percentage rate' })
  @IsNumber()
  @Min(0)
  rateApr: number;
}

export class AcceptOfferDto {
  @ApiProperty({ description: 'Offer ID to accept' })
  @IsString()
  @IsNotEmpty()
  offerId: string;
}
