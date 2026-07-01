import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { ConnectionRegistry } from '../connections/connection-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type Tokens = { accessToken: string; refreshToken: string };

const GUEST_DOMAIN = '@sift.local';
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

function isGuestEmail(email: string): boolean {
  return (
    email === `guest${GUEST_DOMAIN}` ||
    (email.startsWith('guest_') && email.endsWith(GUEST_DOMAIN))
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly registry: ConnectionRegistry,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name ?? null },
    });
    const tokens = await this.issueTokens(user.id, user.email);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return { user: this.sanitize(user), ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.issueTokens(user.id, user.email);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return { user: this.sanitize(user), ...tokens };
  }

  async guest() {
    await this.sweepStaleGuests();
    const user = await this.prisma.user.create({
      data: {
        email: `guest_${randomUUID()}${GUEST_DOMAIN}`,
        passwordHash: await argon2.hash(randomUUID()),
        name: 'Guest',
      },
    });
    const tokens = await this.issueTokens(user.id, user.email);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return { user: this.sanitize(user), ...tokens };
  }

  private async sweepStaleGuests() {
    const cutoff = new Date(Date.now() - GUEST_TTL_MS);
    await this.prisma.user
      .deleteMany({
        where: { email: { startsWith: 'guest_' }, createdAt: { lt: cutoff } },
      })
      .catch(() => undefined);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access denied');
    }
    if (!(await argon2.verify(user.hashedRefreshToken, refreshToken))) {
      throw new UnauthorizedException('Access denied');
    }
    const tokens = await this.issueTokens(user.id, user.email);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string) {
    this.registry.clearUser(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user && isGuestEmail(user.email)) {
      await this.prisma.user
        .delete({ where: { id: userId } })
        .catch(() => undefined);
      return { success: true };
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.sanitize(user);
  }

  private sanitize(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  private async issueTokens(sub: string, email: string): Promise<Tokens> {
    const payload = { sub, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_ACCESS_TTL',
          '15m',
        ) as JwtSignOptions['expiresIn'],
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_REFRESH_TTL',
          '7d',
        ) as JwtSignOptions['expiresIn'],
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async persistRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await argon2.hash(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }
}
