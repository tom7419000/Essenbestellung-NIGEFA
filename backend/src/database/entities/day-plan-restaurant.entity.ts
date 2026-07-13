import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { DayPlan } from './day-plan.entity';
import { Restaurant } from './restaurant.entity';

/** Restaurants, die an einem Tag zur Wahl stehen. */
@Entity('day_plan_restaurants')
@Unique(['dayPlanId', 'restaurantId'])
export class DayPlanRestaurant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'day_plan_id', type: 'uuid' })
  dayPlanId: string;

  @ManyToOne(() => DayPlan, (dp) => dp.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'day_plan_id' })
  dayPlan: DayPlan;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;

  @Column({ name: 'is_runoff_candidate', default: false })
  isRunoffCandidate: boolean;
}
