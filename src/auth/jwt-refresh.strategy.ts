import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request & { body: { refreshToken: string } }, payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findById(payload.sub);
    if (!user?.refreshToken) throw new UnauthorizedException();

    const tokenMatches = await bcrypt.compare(req.body.refreshToken, user.refreshToken);
    if (!tokenMatches) throw new UnauthorizedException();

    return user;
  }
}
