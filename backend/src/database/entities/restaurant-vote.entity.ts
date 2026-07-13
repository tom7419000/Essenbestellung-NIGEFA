import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { DayPlan } from './day-plan.entity';
import { Restaurant } from './restaurant.entity';
import { User } from './user.entity';

/** Eine Stimme pro Benutzer, Tag und Wahlgang (Haupt-/Stichwahl). */
@Entity('restaurant_votes')
@Unique(['dayPlanId', 'userId', 'isRunoffVote'])
export class RestaurantVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'day_plan_id', type: 'uuid' })
  dayPlanId: string;

  @ManyToOne(() => DayPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'day_plan_id' })
  dayPlan: DayPlan;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @Column({ name: 'is_runoff_vote', default: false })
  isRunoffVote: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
