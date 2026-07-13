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
import { numericTransformer } from '../../common/utils/numeric.transformer';
import { DayPlan } from './day-plan.entity';
import { MenuItem } from './menu-item.entity';
import { User } from './user.entity';

/** Bestellposition der Phase 2. */
@Entity('orders')
@Unique(['dayPlanId', 'userId', 'menuItemId'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'day_plan_id', type: 'uuid' })
  dayPlanId: string;

  @ManyToOne(() => DayPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'day_plan_id' })
  dayPlan: DayPlan;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'menu_item_id', type: 'uuid' })
  menuItemId: string;

  @ManyToOne(() => MenuItem, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'menu_item_id' })
  menuItem: MenuItem;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  /** Preis-Snapshot zum Bestellzeitpunkt. */
  @Column({
    name: 'price_at_order',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  priceAtOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
