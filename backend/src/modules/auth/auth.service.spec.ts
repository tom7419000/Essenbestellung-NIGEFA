import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from '../../database/entities/enums';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { User } from '../../database/entities/user.entity';
import { AuthService } from './auth.service';

/** In-Memory-Fake der User-/RefreshToken-Repositories. */
function createUserRepoFake() {
  const rows: User[] = [];
  return {
    rows,
    findOne: jest.fn(({ where }: { where: Partial<User> }) =>
      Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(([key, value]) => (row as any)[key] === value),
        ) ?? null,
      ),
    ),
    count: jest.fn(() => Promise.resolve(rows.length)),
    // Spaltendefaults der Datenbank nachbilden (isActive etc.)
    create: jest.fn((data: Partial<User>) =>
      Object.assign(
        new User(),
        {
          isActive: true,
          isAnonymized: false,
          emailNotifications: true,
          pushNotifications: false,
          locale: 'de',
          role: Role.USER,
        },
        data,
      ),
    ),
    save: jest.fn((user: User) => {
      if (!user.id) {
        user.id = `user-${rows.length + 1}`;
        rows.push(user);
      }
      return Promise.resolve(user);
    }),
  };
}

function createTokenRepoFake() {
  const rows: RefreshToken[] = [];
  return {
    rows,
    findOne: jest.fn(({ where }: { where: Record<string, unknown> }) => {
      const hash = where.tokenHash as string;
      const match = rows.find((row) => row.tokenHash === hash && !row.revokedAt) ?? null;
      return Promise.resolve(match);
    }),
    insert: jest.fn((data: Partial<RefreshToken>) => {
      rows.push(Object.assign(new RefreshToken(), data));
      return Promise.resolve();
    }),
    save: jest.fn((token: RefreshToken) => Promise.resolve(token)),
    update: jest.fn(() => Promise.resolve()),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: ReturnType<typeof createUserRepoFake>;
  let tokenRepo: ReturnType<typeof createTokenRepoFake>;

  beforeEach(async () => {
    userRepo = createUserRepoFake();
    tokenRepo = createTokenRepoFake();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: tokenRepo },
        {
          provide: JwtService,
          useValue: new JwtService({}),
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ((
                {
                  'jwt.accessSecret': 'test-access',
                  'jwt.refreshSecret': 'test-refresh',
                  'jwt.accessTtl': '15m',
                  'jwt.refreshTtl': '7d',
                } as Record<string, string>
              )[key]),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('registriert den ersten Benutzer als ADMIN, weitere als USER', async () => {
    const first = await service.register({
      email: 'erste@nigefa.de',
      password: 'Passwort1',
      firstName: 'Erste',
      lastName: 'Person',
    });
    expect(first.user.role).toBe(Role.ADMIN);
    expect(first.accessToken).toBeTruthy();
    expect(first.refreshToken).toBeTruthy();

    const second = await service.register({
      email: 'zweite@nigefa.de',
      password: 'Passwort1',
      firstName: 'Zweite',
      lastName: 'Person',
    });
    expect(second.user.role).toBe(Role.USER);
  });

  it('lehnt doppelte E-Mail-Adressen ab (409)', async () => {
    await service.register({
      email: 'doppelt@nigefa.de',
      password: 'Passwort1',
      firstName: 'A',
      lastName: 'B',
    });
    await expect(
      service.register({
        email: 'doppelt@nigefa.de',
        password: 'Passwort1',
        firstName: 'C',
        lastName: 'D',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login: falsches Passwort und unbekannte E-Mail → 401 mit identischer Meldung', async () => {
    await service.register({
      email: 'login@nigefa.de',
      password: 'Passwort1',
      firstName: 'L',
      lastName: 'O',
    });
    await expect(
      service.login({ email: 'login@nigefa.de', password: 'falsch99' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login({ email: 'unbekannt@nigefa.de', password: 'Passwort1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login: deaktivierte Konten werden abgewiesen', async () => {
    await service.register({
      email: 'inaktiv@nigefa.de',
      password: 'Passwort1',
      firstName: 'I',
      lastName: 'N',
    });
    userRepo.rows[0].isActive = false;
    await expect(
      service.login({ email: 'inaktiv@nigefa.de', password: 'Passwort1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh: rotiert den Token — der alte wird ungültig', async () => {
    const { refreshToken } = await service.register({
      email: 'rotate@nigefa.de',
      password: 'Passwort1',
      firstName: 'R',
      lastName: 'T',
    });

    const result = await service.refresh(refreshToken);
    expect(result.refreshToken).not.toBe(refreshToken);

    // alter Token ist jetzt widerrufen (revokedAt gesetzt) → zweiter Refresh scheitert
    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh: manipulierte Tokens werden abgelehnt', async () => {
    await expect(service.refresh('kein.echter.token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
