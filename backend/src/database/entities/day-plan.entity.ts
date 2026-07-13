import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DayPlanRestaurant } from './day-plan-restaurant.entity';
import { DayPlanStatus, TieBreakStrategy } from './enums';
import { Restaurant } from './restaurant.entity';
import { User } from './user.entity';

@Entity('day_plans')
export class DayPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Kalendertag als 'YYYY-MM-DD' */
  @Column({ type: 'date', unique: true })
  date: string;

  @Index()
  @Column({
    type: 'enum',
    enum: DayPlanStatus,
    enumName: 'day_plan_status',
    default: DayPlanStatus.SCHEDULED,
  })
  status: DayPlanStatus;

  @Column({ name: 'vote_deadline', type: 'timestamptz' })
  voteDeadline: Date;

  @Column({ name: 'order_deadline', type: 'timestamptz' })
  orderDeadline: Date;

  @Column({ name: 'runoff_deadline', type: 'timestamptz', nullable: true })
  runoffDeadline: Date | null;

  @Column({
    name: 'tie_break_strategy',
    type: 'enum',
    enum: TieBreakStrategy,
    enumName: 'tie_break_strategy',
    default: TieBreakStrategy.RUNOFF,
  })
  tieBreakStrategy: TieBreakStrategy;

  @Column({ name: 'organizer_id', type: 'uuid', nullable: true })
  organizerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organizer_id' })
  organizer: User | null;

  @Column({ name: 'winner_restaurant_id', type: 'uuid', nullable: true })
  winnerRestaurantId: string | null;

  @ManyToOne(() => Restaurant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'winner_restaurant_id' })
  winnerRestaurant: Restaurant | null;

  @Column({ name: 'organizer_note', type: 'text', nullable: true })
  organizerNote: string | null;

  @OneToMany(() => DayPlanRestaurant, (dpr) => dpr.dayPlan)
  options: DayPlanRestaurant[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
