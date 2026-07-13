import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DayPlanRestaurant } from '../../database/entities/day-plan-restaurant.entity';
import { DayPlanStatus } from '../../database/entities/enums';
import { RestaurantVote } from '../../database/entities/restaurant-vote.entity';
import { User } from '../../database/entities/user.entity';
import { DayPlansService } from './day-plans.service';

/** Stimmabgabe der Phase 1 (Haupt- und Stichwahl). */
@Injectable()
export class VoteService {
  constructor(
    @InjectRepository(RestaurantVote)
    private readonly votesRepository: Repository<RestaurantVote>,
    @InjectRepository(DayPlanRestaurant)
    private readonly optionsRepository: Repository<DayPlanRestaurant>,
    private readonly dayPlansService: DayPlansService,
  ) {}

  /** Stimme abgeben oder ändern (Upsert) — gilt für den aktuell laufenden Wahlgang. */
  async castVote(planId: string, user: User, restaurantId: string) {
    const plan = await this.dayPlansService.findByIdOrFail(planId);
    const isRunoff = this.assertVotingOpen(plan.status, plan);

    const option = await this.optionsRepository.findOne({
      where: { dayPlanId: planId, restaurantId },
    });
    if (!option) {
      throw new BadRequestException('Dieses Restaurant steht an diesem Tag nicht zur Wahl');
    }
    if (isRunoff && !option.isRunoffCandidate) {
      throw new BadRequestException('Dieses Restaurant steht nicht in der Stichwahl');
    }

    const existing = await this.votesRepository.findOne({
      where: { dayPlanId: planId, userId: user.id, isRunoffVote: isRunoff },
    });
    if (existing) {
      existing.restaurantId = restaurantId;
      await this.votesRepository.save(existing);
    } else {
      await this.votesRepository.save(
        this.votesRepository.create({
          dayPlanId: planId,
          userId: user.id,
          restaurantId,
          isRunoffVote: isRunoff,
        }),
      );
    }
    return this.dayPlansService.buildDetail(planId, user);
  }

  /** Eigene Stimme des aktuellen Wahlgangs zurückziehen. */
  async removeVote(planId: string, user: User) {
    const plan = await this.dayPlansService.findByIdOrFail(planId);
    const isRunoff = this.assertVotingOpen(plan.status, plan);
    await this.votesRepository.delete({
      dayPlanId: planId,
      userId: user.id,
      isRunoffVote: isRunoff,
    });
    return this.dayPlansService.buildDetail(planId, user);
  }

  /** @returns true = Stichwahl-Wahlgang */
  private assertVotingOpen(
    status: DayPlanStatus,
    plan: { voteDeadline: Date; runoffDeadline: Date | null },
  ): boolean {
    const now = new Date();
    if (status === DayPlanStatus.VOTING_OPEN) {
      if (now >= plan.voteDeadline) {
        throw new ConflictException('Die Abstimmungsfrist ist abgelaufen');
      }
      return false;
    }
    if (status === DayPlanStatus.RUNOFF_VOTING) {
      if (plan.runoffDeadline && now >= plan.runoffDeadline) {
        throw new ConflictException('Die Stichwahl-Frist ist abgelaufen');
      }
      return true;
    }
    throw new ConflictException('Die Abstimmung ist derzeit nicht geöffnet');
  }
}
