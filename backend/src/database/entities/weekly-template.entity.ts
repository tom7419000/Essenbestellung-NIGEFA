import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TieBreakStrategy } from './enums';
import { User } from './user.entity';
import { WeeklyTemplateRestaurant } from './weekly-template-restaurant.entity';

/** Wochenvorlage: Planung je Wochentag (0 = Sonntag … 6 = Samstag). */
@Entity('weekly_templates')
@Unique(['weekday'])
export class WeeklyTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  weekday: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'organizer_id', type: 'uuid', nullable: true })
  organizerId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'organizer_id' })
  organizer: User | null;

  /** 'HH:mm:ss' aus PostgreSQL */
  @Column({ name: 'vote_deadline_time', type: 'time', default: '10:00' })
  voteDeadlineTime: string;

  @Column({ name: 'order_deadline_time', type: 'time', default: '11:30' })
  orderDeadlineTime: string;

  /** NULL = globale Einstellung verwenden */
  @Column({
    name: 'tie_break_strategy',
    type: 'enum',
    enum: TieBreakStrategy,
    enumName: 'tie_break_strategy',
    nullable: true,
  })
  tieBreakStrategy: TieBreakStrategy | null;

  @OneToMany(() => WeeklyTemplateRestaurant, (wtr) => wtr.weeklyTemplate)
  restaurants: WeeklyTemplateRestaurant[];
}
