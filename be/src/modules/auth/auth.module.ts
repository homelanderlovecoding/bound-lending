import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ENV_REGISTER } from '../../commons/constants';
import { IAppConfig } from '../../commons/types';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<IAppConfig>(ENV_REGISTER.APP);
        return {
          secret: appConfig?.jwtSecret,
          signOptions: { expiresIn: appConfig?.jwtExpiresIn ?? '15m' },
        };
      },
    }),
    UserModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
