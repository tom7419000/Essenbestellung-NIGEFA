import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Restaurant } from './restaurant.entity';
import { WeeklyTemplate } from './weekly-template.entity';

@Entity('weekly_template_restaurants')
@Unique(['weeklyTemplateId', 'restaurantId'])
export class WeeklyTemplateRestaurant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'weekly_template_id', type: 'uuid' })
  weeklyTemplateId: string;

  @ManyToOne(() => WeeklyTemplate, (wt) => wt.restaurants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'weekly_template_id' })
  weeklyTemplate: WeeklyTemplate;

  @Column({ name: 'restaurant_id', type: 'uuid' })
  restaurantId: string;

  @ManyToOne(() => Restaurant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'restaurant_id' })
  restaurant: Restaurant;
}
