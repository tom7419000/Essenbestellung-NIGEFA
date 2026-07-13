import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { TieBreakStrategy } from './enums';

/** Globale Einstellungen — Singleton-Zeile mit id = 1. */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ name: 'vote_deadline_time', type: 'time', default: '10:00' })
  voteDeadlineTime: string;

  @Column({ name: 'order_deadline_time', type: 'time', default: '11:30' })
  orderDeadlineTime: string;

  @Column({
    name: 'tie_break_strategy',
    type: 'enum',
    enum: TieBreakStrategy,
    enumName: 'tie_break_strategy',
    default: TieBreakStrategy.RUNOFF,
  })
  tieBreakStrategy: TieBreakStrategy;

  @Column({ name: 'runoff_minutes', type: 'int', default: 15 })
  runoffMinutes: number;

  @Column({ name: 'reminder_lead_minutes', type: 'int', default: 30 })
  reminderLeadMinutes: number;

  @Column({ length: 64, default: 'Europe/Berlin' })
  timezone: string;

  @Column({ name: 'auto_generate_from_template', default: true })
  autoGenerateFromTemplate: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
