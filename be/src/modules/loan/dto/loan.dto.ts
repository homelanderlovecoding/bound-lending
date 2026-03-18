import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignPsbtDto {
  @ApiProperty({ description: 'Signed PSBT hex' })
  @IsString()
  @IsNotEmpty()
  signedPsbtHex: string;
}

export class LoanQueryDto {
  @ApiPropertyOptional({ description: 'Filter by role: borrower or lender' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by state' })
  @IsOptional()
  @IsString()
  status?: string;
}
