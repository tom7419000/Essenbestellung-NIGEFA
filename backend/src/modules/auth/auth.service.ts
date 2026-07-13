import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Role } from '../../database/entities/enums';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { User } from '../../database/entities/user.entity';
import { BCRYPT_ROUNDS, PublicUser, sanitizeUser } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /** Der erste registrierte Benutzer wird automatisch Administrator. */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('E-Mail-Adresse ist bereits registriert');

    const isFirstUser = (await this.usersRepository.count()) === 0;
    const user = this.usersRepository.create({
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: isFirstUser ? Role.ADMIN : Role.USER,
      locale: dto.locale ?? 'de',
    });
    await this.usersRepository.save(user);
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    if (!user || user.isAnonymized) {
      throw new UnauthorizedException('E-Mail oder Passwort ist falsch');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('E-Mail oder Passwort ist falsch');
    if (!user.isActive) throw new UnauthorizedException('Konto ist deaktiviert');
    return this.issueTokens(user);
  }

  /** Refresh-Token-Rotation: alter Token wird widerrufen, neues Paar ausgestellt. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh Token ungültig oder abgelaufen');
    }

    const stored = await this.refreshTokensRepository.findOne({
      where: { tokenHash: sha256(refreshToken), revokedAt: IsNull() },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh Token widerrufen oder abgelaufen');
    }

    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.isAnonymized) {
      throw new UnauthorizedException('Konto nicht verfügbar');
    }

    stored.revokedAt = new Date();
    await this.refreshTokensRepository.save(stored);
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokensRepository.update(
      { tokenHash: sha256(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async issueTokens(user: User): Promise<AuthResult> {
    const accessTtl = (this.configService.get<string>('jwt.accessTtl') ??
      '15m') as JwtSignOptions['expiresIn'];
    const refreshTtl = (this.configService.get<string>('jwt.refreshTtl') ??
      '7d') as JwtSignOptions['expiresIn'];
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: accessTtl,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, jti: randomUUID() },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshTtl,
      },
    );

    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);
    await this.refreshTokensRepository.insert({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
    });

    return { user: sanitizeUser(user), accessToken, refreshToken };
  }
}
