'use client';

import { Badge, type BadgeColor } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import type { DayPlanStatus } from '@/lib/types';

// Statusfarben exakt gemäß docs/06-ui-ux-konzept.md
const statusColors: Record<DayPlanStatus, BadgeColor> = {
  SCHEDULED: 'gray',
  VOTING_OPEN: 'blue',
  RUNOFF_VOTING: 'violet',
  TIE_ADMIN_DECISION: 'amber',
  ORDERING_OPEN: 'emerald',
  ORDERING_CLOSED: 'amber',
  ORDERED: 'sky',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

export function StatusBadge({ status }: { status: DayPlanStatus }) {
  const { t } = useI18n();
  return <Badge color={statusColors[status] ?? 'gray'}>{t(`status.${status}`)}</Badge>;
}
