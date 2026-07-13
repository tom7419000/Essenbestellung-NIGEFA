import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Brackets, IsNull, Repository } from 'typeorm';
import { Paginated } from '../../common/dto/pagination.dto';
import { assignDefined } from '../../common/utils/assign-defined.util';
import { Role } from '../../database/entities/enums';
import { PushSubscription } from '../../database/entities/push-subscription.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import {
  ChangePasswordDto,
  CreateUserDto,
  UpdateMeDto,
  UpdateUserDto,
} from './dto/user.dto';

export const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  locale: string;
  isActive: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  createdAt: Date;
}

export function sanitizeUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    locale: user.locale,
    isActive: user.isActive,
    emailNotifications: user.emailNotifications,
    pushNotifications: user.pushNotifications,
    createdAt: user.createdAt,
  };
}

export function userRef(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(PushSubscription)
    private readonly pushSubscriptionsRepository: Repository<PushSubscription>,
    private readonly auditService: AuditService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Benutzer nicht gefunden');
    return user;
  }

  async list(options: {
    page: number;
    limit: number;
    search?: string;
    all?: boolean;
  }): Promise<Paginated<PublicUser> | { items: PublicUser[] }> {
    if (options.all) {
      const users = await this.usersRepository.find({
        where: { isActive: true, isAnonymized: false },
        order: { firstName: 'ASC', lastName: 'ASC' },
      });
      return { items: users.map(sanitizeUser) };
    }

    const query = this.usersRepository.createQueryBuilder('user');
    if (options.search) {
      const term = `%${options.search.toLowerCase()}%`;
      query.where(
        new Brackets((qb) =>
          qb
            .where('LOWER(user.email) LIKE :term', { term })
            .orWhere('LOWER(user.first_name) LIKE :term', { term })
            .orWhere('LOWER(user.last_name) LIKE :term', { term }),
        ),
      );
    }
    const [users, total] = await query
      .orderBy('user.created_at', 'DESC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit)
      .getManyAndCount();

    return {
      items: users.map(sanitizeUser),
      total,
      page: options.page,
      limit: options.limit,
    };
  }

  async create(dto: CreateUserDto, actorId: string): Promise<PublicUser> {
    await this.assertEmailFree(dto.email);
    const user = this.usersRepository.create({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: dto.role ?? Role.USER,
      locale: dto.locale ?? 'de',
    });
    await this.usersRepository.save(user);
    await this.auditService.log(actorId, 'user.create', 'User', user.id, {
      email: user.email,
      role: user.role,
    });
    return sanitizeUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<PublicUser> {
    const user = await this.findById(id);
    if (user.isAnonymized) throw new BadRequestException('Konto ist anonymisiert');

    if (dto.role === Role.USER && user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(id, 'Der letzte Administrator kann nicht herabgestuft werden');
    }
    if (dto.isActive === false && user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(id, 'Der letzte Administrator kann nicht deaktiviert werden');
    }

    const before = { role: user.role, isActive: user.isActive };
    assignDefined(user, dto);
    await this.usersRepository.save(user);
    await this.auditService.log(actorId, 'user.update', 'User', user.id, {
      before,
      changes: { ...dto },
    });
    return sanitizeUser(user);
  }

  async resetPassword(id: string, newPassword: string, actorId: string): Promise<void> {
    const user = await this.findById(id);
    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.usersRepository.save(user);
    await this.revokeAllRefreshTokens(user.id);
    await this.auditService.log(actorId, 'user.resetPassword', 'User', user.id);
  }

  /**
   * DSGVO-konforme Löschung: personenbezogene Daten werden überschrieben,
   * fachliche Historie (Stimmen/Bestellungen) bleibt anonym für Statistiken erhalten.
   */
  async anonymize(id: string, actorId: string): Promise<void> {
    const user = await this.findById(id);
    if (user.id === actorId) {
      throw new BadRequestException('Das eigene Konto kann nicht gelöscht werden');
    }
    if (user.role === Role.ADMIN) {
      await this.assertNotLastAdmin(id, 'Der letzte Administrator kann nicht gelöscht werden');
    }

    const originalEmail = user.email;
    user.email = `geloescht-${user.id.slice(0, 8)}@anonym.local`;
    user.firstName = 'Gelöschter';
    user.lastName = 'Benutzer';
    user.passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
    user.isActive = false;
    user.isAnonymized = true;
    user.emailNotifications = false;
    user.pushNotifications = false;
    await this.usersRepository.save(user);

    await this.refreshTokensRepository.delete({ userId: user.id });
    await this.pushSubscriptionsRepository.delete({ userId: user.id });

    await this.auditService.log(actorId, 'user.anonymize', 'User', user.id, {
      emailHashHint: originalEmail.slice(0, 2) + '***',
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<PublicUser> {
    const user = await this.findById(userId);
    assignDefined(user, dto);
    await this.usersRepository.save(user);
    return sanitizeUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findById(userId);
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Aktuelles Passwort ist falsch');
    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.usersRepository.save(user);
    await this.revokeAllRefreshTokens(user.id);
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokensRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async assertEmailFree(email: string): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { email } });
    if (existing) throw new ConflictException('E-Mail-Adresse ist bereits registriert');
  }

  private async assertNotLastAdmin(excludeId: string, message: string): Promise<void> {
    const otherAdmins = await this.usersRepository
      .createQueryBuilder('user')
      .where('user.role = :role', { role: Role.ADMIN })
      .andWhere('user.id != :id', { id: excludeId })
      .andWhere('user.is_active = true')
      .andWhere('user.is_anonymized = false')
      .getCount();
    if (otherAdmins === 0) throw new BadRequestException(message);
  }
}
