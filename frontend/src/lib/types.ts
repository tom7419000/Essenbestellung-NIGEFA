// TypeScript-Interfaces für alle API-Objekte gemäß docs/04-api-spezifikation.md

export type Role = 'ADMIN' | 'USER';
export type Locale = 'de' | 'en';
export type TieBreakStrategy = 'RUNOFF' | 'ADMIN_DECISION';

export type DayPlanStatus =
  | 'SCHEDULED'
  | 'VOTING_OPEN'
  | 'RUNOFF_VOTING'
  | 'TIE_ADMIN_DECISION'
  | 'ORDERING_OPEN'
  | 'ORDERING_CLOSED'
  | 'ORDERED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  locale: Locale;
  isActive: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  createdAt: string;
}

export interface UserPublic {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  phone: string | null;
  website: string | null;
  menuUrl: string | null;
  isActive: boolean;
  createdAt: string;
  menuItems?: MenuItem[];
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  isAvailable: boolean;
}

export interface DayPlanOption {
  restaurantId: string;
  name: string;
  cuisine: string | null;
  description: string | null;
  voteCount: number;
  isRunoffCandidate: boolean;
}

export interface WinnerRestaurant {
  id: string;
  name: string;
  cuisine: string | null;
  description: string | null;
  menuItems: MenuItem[];
}

export interface DayPlanDetail {
  id: string;
  date: string;
  status: DayPlanStatus;
  voteDeadline: string | null;
  orderDeadline: string | null;
  runoffDeadline: string | null;
  tieBreakStrategy: TieBreakStrategy;
  organizer: UserPublic | null;
  organizerNote: string | null;
  options: DayPlanOption[];
  winnerRestaurant: WinnerRestaurant | null;
  myVote: { restaurantId: string } | null;
  myRunoffVote: { restaurantId: string } | null;
  myOrders: OrderLine[];
  totalVotes: number;
  totalOrders: number;
}

export interface DayPlanLite {
  id: string;
  date: string;
  status: DayPlanStatus;
  voteDeadline: string | null;
  orderDeadline: string | null;
  organizer: UserPublic | null;
  winnerRestaurant: { id: string; name: string } | null;
  totalVotes: number;
  totalOrders: number;
}

export interface OrderLine {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  note: string | null;
  priceAtOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  dayPlanId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface NotificationList extends Paginated<AppNotification> {
  unreadCount: number;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface OrderHistoryEntry {
  dayPlanId: string;
  date: string;
  dayStatus: DayPlanStatus;
  restaurantName: string;
  lines: { name: string; quantity: number; note: string | null; priceAtOrder: number }[];
  total: number;
}

export interface SummaryByMenuItem {
  menuItemId: string;
  name: string;
  price: number;
  totalQuantity: number;
  orders: { user: UserPublic; quantity: number; note: string | null }[];
}

export interface SummaryByUser {
  user: UserPublic;
  lines: {
    name: string;
    quantity: number;
    note: string | null;
    priceAtOrder: number;
    lineTotal: number;
  }[];
  userTotal: number;
}

export interface Summary {
  dayPlan: DayPlanLite & {
    organizerNote: string | null;
    winnerRestaurant: { id: string; name: string } | null;
  };
  byMenuItem: SummaryByMenuItem[];
  byUser: SummaryByUser[];
  participantCount: number;
  grandTotal: number;
}

export interface VoteRecord {
  user: UserPublic;
  restaurant: { id: string; name: string };
  isRunoffVote: boolean;
  createdAt: string;
}

export interface WeeklyTemplate {
  weekday: number; // 0 = Sonntag … 6 = Samstag
  isActive: boolean;
  restaurants: { id: string; name: string }[];
  organizer: UserPublic | null;
  voteDeadlineTime: string | null;
  orderDeadlineTime: string | null;
  tieBreakStrategy: TieBreakStrategy | null;
}

export interface Settings {
  voteDeadlineTime: string;
  orderDeadlineTime: string;
  tieBreakStrategy: TieBreakStrategy;
  runoffMinutes: number;
  reminderLeadMinutes: number;
  timezone: string;
  autoGenerateFromTemplate: boolean;
}

export interface Stats {
  totalUsers: number;
  activeUsers: number;
  participationRate: number;
  votesToday: number;
  ordersToday: number;
  topRestaurants: { restaurantId: string; name: string; wins: number; votes: number }[];
  topMenuItems: { name: string; restaurantName: string; totalQuantity: number }[];
  ordersPerDay: { date: string; participants: number; orders: number; total: number }[];
  totalSpend: number;
}

export interface MyStats {
  daysParticipated: number;
  totalItems: number;
  totalSpend: number;
  favoriteRestaurant: string | null;
  favoriteMenuItem: string | null;
}

export interface AuditLog {
  id: string;
  actor: UserPublic | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
}

export interface VapidKeyResponse {
  key: string | null;
}

// Request-Payloads

export interface CreateDayPlanPayload {
  date: string;
  restaurantIds: string[];
  organizerId?: string | null;
  voteDeadlineTime?: string;
  orderDeadlineTime?: string;
  tieBreakStrategy?: TieBreakStrategy;
}

export interface UpdateDayPlanPayload {
  restaurantIds?: string[];
  organizerId?: string | null;
  voteDeadlineTime?: string;
  orderDeadlineTime?: string;
  tieBreakStrategy?: TieBreakStrategy;
}

export interface MyOrdersPayload {
  items: { menuItemId: string; quantity: number; note?: string }[];
}

export interface WeeklyTemplatePayload {
  isActive: boolean;
  restaurantIds: string[];
  organizerId: string | null;
  voteDeadlineTime?: string;
  orderDeadlineTime?: string;
  tieBreakStrategy: TieBreakStrategy | null;
}
