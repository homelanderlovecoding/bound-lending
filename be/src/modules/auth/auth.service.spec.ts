import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ENV_REGISTER } from '../../commons/constants';

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn().mockReturnValue({ sub: 'bc1qaddr', userId: 'uid-123', roles: ['borrower'] }),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === ENV_REGISTER.APP) {
      return { jwtExpiresIn: '15m', jwtRefreshExpiresIn: '7d' };
    }
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('generateChallenge', () => {
    it('should return message, nonce, and expiresAt', () => {
      const result = service.generateChallenge('bc1qfakeaddr');
      expect(result.message).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should include the wallet address in the challenge message', () => {
      const address = 'bc1qfakeaddr123';
      const result = service.generateChallenge(address);
      expect(result.message).toContain(address);
    });
  });

  describe('verifyAndIssueTokens', () => {
    it('should return accessToken and refreshToken for valid challenge', async () => {
      const address = 'bc1qverifytest';
      const { nonce } = service.generateChallenge(address);

      const result = await service.verifyAndIssueTokens(
        { address, signature: 'fake-sig', nonce },
        'user-id',
        ['borrower'],
      );

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockJwtService.sign).toHaveBeenCalled();
    });

    it('should reject an expired challenge', async () => {
      jest.useFakeTimers();

      const address = 'bc1qexpiredtest';
      const { nonce } = service.generateChallenge(address);

      // Advance past 5-minute TTL
      jest.advanceTimersByTime(6 * 60 * 1000);

      await expect(
        service.verifyAndIssueTokens(
          { address, signature: 'fake-sig', nonce },
          'user-id',
          ['borrower'],
        ),
      ).rejects.toThrow(BadRequestException);

      jest.useRealTimers();
    });

    it('should reject an unknown nonce', async () => {
      await expect(
        service.verifyAndIssueTokens(
          { address: 'bc1qaddr', signature: 'fake-sig', nonce: 'nonexistent-nonce' },
          'user-id',
          ['borrower'],
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new tokens from a valid refresh token', async () => {
      const result = await service.refreshAccessToken('valid.refresh.token');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid.refresh.token');
    });

    it('should throw UnauthorizedException for invalid/expired refresh token', async () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshAccessToken('expired.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
