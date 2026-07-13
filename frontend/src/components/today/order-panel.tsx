'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { DayPlanDetail, MenuItem, OrderLine } from '@/lib/types';
import { cn } from '@/lib/cn';
import {
  CartIcon,
  ChevronDownIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  TrophyIcon,
} from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { Countdown } from './countdown';
import { PhaseBanner } from './phase-banner';

interface CartLine {
  menuItemId: string;
  quantity: number;
  note: string;
}

const MAX_QUANTITY = 20;

/**
 * Bestell-Panel für ORDERING_OPEN: Gewinner-Banner, Speisekarte nach Kategorie,
 * Warenkorb (Desktop: sticky rechts, mobil: einklappbar) mit Menge/Bemerkung/Summe.
 */
export function OrderPanel({
  plan,
  onDeadlineReached,
}: {
  plan: DayPlanDetail;
  onDeadlineReached: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const initializedPlanRef = useRef<string | null>(null);

  // Warenkorb einmalig pro Plan aus den eigenen Bestellungen initialisieren
  // (nicht bei jedem 15-s-Refetch überschreiben!).
  useEffect(() => {
    if (initializedPlanRef.current !== plan.id) {
      initializedPlanRef.current = plan.id;
      setCart(
        plan.myOrders.map((line) => ({
          menuItemId: line.menuItem.id,
          quantity: line.quantity,
          note: line.note ?? '',
        })),
      );
    }
  }, [plan.id, plan.myOrders]);

  const winner = plan.winnerRestaurant;

  const menuById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of winner?.menuItems ?? []) map.set(item.id, item);
    // Fallback für bereits bestellte Positionen, die nicht (mehr) in der Karte stehen
    for (const line of plan.myOrders) {
      if (!map.has(line.menuItem.id)) map.set(line.menuItem.id, line.menuItem);
    }
    return map;
  }, [winner, plan.myOrders]);

  const categories = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of winner?.menuItems ?? []) {
      const key = item.category?.trim() || t('today.order.uncategorized');
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [winner, t]);

  const total = cart.reduce(
    (sum, line) => sum + (menuById.get(line.menuItemId)?.price ?? 0) * line.quantity,
    0,
  );
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<OrderLine[]>(`/day-plans/${plan.id}/my-orders`, {
        items: cart.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          ...(line.note.trim() ? { note: line.note.trim() } : {}),
        })),
      }),
    onSuccess: (lines) => {
      queryClient.setQueryData<DayPlanDetail>(['day-plans', 'today'], (old) =>
        old ? { ...old, myOrders: lines } : old,
      );
      setCart(
        lines.map((line) => ({
          menuItemId: line.menuItem.id,
          quantity: line.quantity,
          note: line.note ?? '',
        })),
      );
      toast.success(t('today.order.saved'));
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const addItem = (id: string) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.menuItemId === id);
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === id
            ? { ...line, quantity: Math.min(MAX_QUANTITY, line.quantity + 1) }
            : line,
        );
      }
      return [...prev, { menuItemId: id, quantity: 1, note: '' }];
    });
    setCartOpen(true);
  };

  const setQuantity = (id: string, quantity: number) => {
    const clamped = Math.min(MAX_QUANTITY, Math.max(1, quantity));
    setCart((prev) =>
      prev.map((line) => (line.menuItemId === id ? { ...line, quantity: clamped } : line)),
    );
  };

  const setNote = (id: string, note: string) => {
    setCart((prev) => prev.map((line) => (line.menuItemId === id ? { ...line, note } : line)));
  };

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((line) => line.menuItemId !== id));
  };

  const cartContent = (
    <div>
      {cart.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('today.order.cartEmpty')}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {cart.map((line) => {
            const item = menuById.get(line.menuItemId);
            if (!item) return null;
            return (
              <li key={line.menuItemId} className="py-3 first:pt-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeItem(line.menuItemId)}
                    aria-label={t('today.order.removeItem', { name: item.name })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label={t('today.order.decreaseQty', { name: item.name })}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <span
                      className="w-8 text-center text-sm font-semibold tabular-nums"
                      aria-live="polite"
                    >
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
                      disabled={line.quantity >= MAX_QUANTITY}
                      aria-label={t('today.order.increaseQty', { name: item.name })}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrency(item.price * line.quantity, locale)}
                  </span>
                </div>
                <input
                  type="text"
                  value={line.note}
                  maxLength={200}
                  onChange={(e) => setNote(line.menuItemId, e.target.value)}
                  placeholder={t('today.order.notePlaceholder')}
                  aria-label={t('today.order.noteLabel', { name: item.name })}
                  className="mt-2 h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-800">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {t('today.order.total')}
        </span>
        <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {formatCurrency(total, locale)}
        </span>
      </div>
      <Button
        className="mt-3 w-full"
        onClick={() => saveMutation.mutate()}
        loading={saveMutation.isPending}
      >
        {t('today.order.saveButton')}
      </Button>
      {plan.myOrders.length > 0 && cart.length === 0 ? (
        <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-400">
          {t('today.order.emptySaveHint')}
        </p>
      ) : null}
    </div>
  );

  return (
    <section aria-label={t('today.order.title')} className="space-y-4">
      <PhaseBanner
        tone="emerald"
        icon={<TrophyIcon className="h-5 w-5" />}
        title={t('today.order.winnerBanner', { name: winner?.name ?? '' })}
        action={
          plan.orderDeadline ? (
            <Countdown
              deadline={plan.orderDeadline}
              label={t('today.countdown.orderUntil')}
              onExpire={onDeadlineReached}
            />
          ) : undefined
        }
      >
        {t('today.order.winnerBannerHint')}
      </PhaseBanner>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Speisekarte */}
        <div className="space-y-4 lg:order-1">
          {categories.length === 0 ? (
            <Card className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('today.order.noMenu')}
            </Card>
          ) : (
            categories.map(([category, items]) => (
              <Card key={category} className="p-4 sm:p-5">
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  {category}
                </h3>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item) => {
                    const inCart = cart.find((line) => line.menuItemId === item.id);
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {item.name}
                            {inCart ? (
                              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                                ×{inCart.quantity}
                              </span>
                            ) : null}
                          </p>
                          {item.description ? (
                            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            {formatCurrency(item.price, locale)}
                          </span>
                          <IconButton
                            variant="secondary"
                            aria-label={t('today.order.addItem', { name: item.name })}
                            onClick={() => addItem(item.id)}
                          >
                            <PlusIcon className="h-5 w-5" />
                          </IconButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))
          )}
        </div>

        {/* Warenkorb */}
        <div className="lg:sticky lg:top-20 lg:order-2">
          <Card className="p-4 sm:p-5">
            {/* Mobil: einklappbarer Kopf */}
            <button
              type="button"
              onClick={() => setCartOpen((v) => !v)}
              aria-expanded={cartOpen}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 lg:hidden"
            >
              <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
                <CartIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                {t('today.order.cartTitle')}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({t('today.order.itemCount', { count: itemCount })})
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-bold tabular-nums">{formatCurrency(total, locale)}</span>
                <ChevronDownIcon
                  className={cn('h-4 w-4 transition-transform', cartOpen && 'rotate-180')}
                />
              </span>
            </button>
            {/* Desktop: statischer Kopf */}
            <h3 className="hidden items-center gap-2 font-semibold text-gray-900 dark:text-gray-100 lg:flex">
              <CartIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              {t('today.order.cartTitle')}
            </h3>
            <div className={cn('mt-3', cartOpen ? 'block' : 'hidden', 'lg:block')}>
              {cartContent}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
