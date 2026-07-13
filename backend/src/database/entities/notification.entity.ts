import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DayPlan } from './day-plan.entity';
import { NotificationType } from './enums';
import { User } from './user.entity';

/** In-App-Benachrichtigung (E-Mail/Push nutzen dieselben Ereignisse). */
@Entity('notifications')
@Index(['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notification_type' })
  type: NotificationType;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'day_plan_id', type: 'uuid', nullable: true })
  dayPlanId: string | null;

  @ManyToOne(() => DayPlan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'day_plan_id' })
  dayPlan: DayPlan | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
