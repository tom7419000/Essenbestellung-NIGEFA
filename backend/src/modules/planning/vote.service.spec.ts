import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { DayPlanStatus } from '../../database/entities/enums';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { DayPlansService } from './day-plans.service';
import { VoteService } from './vote.service';

describe('VoteService — Stimmabgabe Phase 1', () => {
  const user = Object.assign(new User(), { id: 'user-1' });
  const inOneHour = new Date(Date.now() + 60 * 60_000);
  const oneHourAgo = new Date(Date.now() - 60 * 60_000);

  let plan: {
    id: string;
    status: DayPlanStatus;
    voteDeadline: Date;
    runoffDeadline: Date | null;
  };
  let votesRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let optionsRepo: { findOne: jest.Mock };
  let service: VoteService;

  beforeEach(async () => {
    plan = {
      id: 'plan-1',
      status: DayPlanStatus.VOTING_OPEN,
      voteDeadline: inOneHour,
      runoffDeadline: null,
    };
    votesRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((vote) => Promise.resolve(vote)),
      create: jest.fn().mockImplementation((data) => data),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    optionsRepo = {
      findOne: jest.fn().mockResolvedValue({ restaurantId: 'r-1', isRunoffCandidate: false }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        VoteService,
        { provide: getRepositoryToken(RestaurantVote), useValue: votesRepo },
        { provide: getRepositoryToken(DayPlanRestaurant), useValue: optionsRepo },
        {
          provide: DayPlansService,
          useValue: {
            findByIdOrFail: jest.fn(() => Promise.resolve(plan)),
            buildDetail: jest.fn(() => Promise.resolve({ id: plan.id })),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(VoteService);
  });

  it('legt eine neue Stimme im Hauptwahlgang an', async () => {
    await service.castVote('plan-1', user, 'r-1');
    expect(votesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-1', isRunoffVote: false, userId: 'user-1' }),
    );
  });

  it('ändert eine vorhandene Stimme (Upsert statt Duplikat)', async () => {
    const existing = { restaurantId: 'r-alt', isRunoffVote: false };
    votesRepo.findOne.mockResolvedValue(existing);
    await service.castVote('plan-1', user, 'r-1');
    expect(existing.restaurantId).toBe('r-1');
    expect(votesRepo.save).toHaveBeenCalledWith(existing);
  });

  it('weist Stimmen nach Fristablauf mit 409 ab', async () => {
    plan.voteDeadline = oneHourAgo;
    await expect(service.castVote('plan-1', user, 'r-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('weist Stimmen außerhalb der Abstimmungsphasen ab', async () => {
    plan.status = DayPlanStatus.ORDERING_OPEN;
    await expect(service.castVote('plan-1', user, 'r-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('weist Restaurants ab, die nicht zur Wahl stehen', async () => {
    optionsRepo.findOne.mockResolvedValue(null);
    await expect(service.castVote('plan-1', user, 'r-x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('Stichwahl: nur Stichwahl-Kandidaten sind wählbar, Stimme zählt als Runoff-Stimme', async () => {
    plan.status = DayPlanStatus.RUNOFF_VOTING;
    plan.runoffDeadline = inOneHour;

    optionsRepo.findOne.mockResolvedValue({ restaurantId: 'r-1', isRunoffCandidate: false });
    await expect(service.castVote('plan-1', user, 'r-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    optionsRepo.findOne.mockResolvedValue({ restaurantId: 'r-2', isRunoffCandidate: true });
    await service.castVote('plan-1', user, 'r-2');
    expect(votesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: 'r-2', isRunoffVote: true }),
    );
  });

  it('removeVote löscht nur die Stimme des aktuellen Wahlgangs', async () => {
    await service.removeVote('plan-1', user);
    expect(votesRepo.delete).toHaveBeenCalledWith({
      dayPlanId: 'plan-1',
      userId: 'user-1',
      isRunoffVote: false,
    });
  });
});
