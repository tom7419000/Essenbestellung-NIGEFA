'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { formatCurrency } from '@/lib/format';
import { splitFieldErrors } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { ImportResult, MenuItem, Restaurant } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import {
  ChevronLeftIcon,
  ImportIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { RestaurantFormDialog } from '@/components/admin/restaurant-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SkeletonCards } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

export default function AdminRestaurantDetailPage() {
  const params = useParams<{ id: string }>();
  const restaurantId = params.id;
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [itemDialog, setItemDialog] = useState<{ item: MenuItem | null } | null>(null);
  const [deleteItem, setDeleteItem] = useState<MenuItem | null>(null);

  const query = useQuery({
    queryKey: ['restaurants', restaurantId],
    queryFn: () => api.get<Restaurant>(`/restaurants/${restaurantId}`),
    enabled: Boolean(restaurantId),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['restaurants'] });

  const availabilityMutation = useMutation({
    mutationFn: ({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) =>
      api.patch<MenuItem>(`/restaurants/${restaurantId}/menu-items/${itemId}`, { isAvailable }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/restaurants/${restaurantId}/menu-items/${itemId}`),
    onSuccess: () => {
      invalidate();
      setDeleteItem(null);
      toast.success(t('admin.menu.deleted'));
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  if (query.isPending) return <SkeletonCards count={3} />;
  if (query.error)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const restaurant = query.data;
  const menuItems = restaurant.menuItems ?? [];

  return (
    <div className="space-y-4">
      <Link
        href="/admin/restaurants"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-gray-400 dark:hover:text-gray-100"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        {t('admin.restaurants.backToList')}
      </Link>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {restaurant.name}
              {!restaurant.isActive ? <Badge color="red">{t('common.inactive')}</Badge> : null}
            </span>
          }
          description={restaurant.cuisine ?? undefined}
          action={
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilIcon className="h-4 w-4" />
              {t('common.edit')}
            </Button>
          }
        />
        <CardBody className="space-y-1.5 pt-0 text-sm text-gray-600 dark:text-gray-300">
          {restaurant.description ? <p>{restaurant.description}</p> : null}
          {restaurant.phone ? (
            <p>
              <span className="font-medium">{t('admin.restaurants.phone')}:</span>{' '}
              {restaurant.phone}
            </p>
          ) : null}
          {restaurant.website ? (
            <p className="truncate">
              <span className="font-medium">{t('admin.restaurants.website')}:</span>{' '}
              <a
                href={restaurant.website}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                {restaurant.website}
              </a>
            </p>
          ) : null}
          {restaurant.menuUrl ? (
            <p className="truncate">
              <span className="font-medium">{t('admin.restaurants.menuUrl')}:</span>{' '}
              <span className="text-gray-500 dark:text-gray-400">{restaurant.menuUrl}</span>
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('admin.menu.title')}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <ImportIcon className="h-4 w-4" />
            {t('admin.menu.importButton')}
          </Button>
          <Button onClick={() => setItemDialog({ item: null })}>
            <PlusIcon className="h-4 w-4" />
            {t('admin.menu.addButton')}
          </Button>
        </div>
      </div>

      {menuItems.length === 0 ? (
        <EmptyState
          title={t('admin.menu.empty')}
          description={t('admin.menu.emptyHint')}
        />
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>{t('admin.menu.name')}</Th>
              <Th>{t('admin.menu.category')}</Th>
              <Th className="text-right">{t('admin.menu.price')}</Th>
              <Th>{t('admin.menu.available')}</Th>
              <Th className="text-right">{t('common.actions')}</Th>
            </Tr>
          </THead>
          <TBody>
            {menuItems.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                  {item.description ? (
                    <p className="max-w-xs truncate text-xs text-gray-500 dark:text-gray-400">
                      {item.description}
                    </p>
                  ) : null}
                </Td>
                <Td>{item.category ?? '—'}</Td>
                <Td className="text-right tabular-nums">
                  {formatCurrency(item.price, locale)}
                </Td>
                <Td>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.isAvailable}
                    aria-label={t('admin.menu.availableLabel', { name: item.name })}
                    disabled={availabilityMutation.isPending}
                    onClick={() =>
                      availabilityMutation.mutate({
                        itemId: item.id,
                        isAvailable: !item.isAvailable,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 ${
                      item.isAvailable
                        ? 'bg-emerald-600 dark:bg-emerald-500'
                        : 'bg-gray-300 dark:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        item.isAvailable ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <IconButton
                      size="sm"
                      aria-label={t('admin.menu.editLabel', { name: item.name })}
                      onClick={() => setItemDialog({ item })}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      size="sm"
                      aria-label={t('admin.menu.deleteLabel', { name: item.name })}
                      onClick={() => setDeleteItem(item)}
                      className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </IconButton>
                  </div>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {editOpen ? (
        <RestaurantFormDialog
          restaurant={restaurant}
          onClose={() => setEditOpen(false)}
          onSaved={invalidate}
        />
      ) : null}
      {itemDialog ? (
        <MenuItemDialog
          restaurantId={restaurantId}
          item={itemDialog.item}
          onClose={() => setItemDialog(null)}
          onSaved={invalidate}
        />
      ) : null}
      {importOpen ? (
        <ImportMenuDialog
          restaurant={restaurant}
          onClose={() => setImportOpen(false)}
          onImported={invalidate}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteItem)}
        title={t('admin.menu.deleteTitle')}
        message={t('admin.menu.deleteMessage', { name: deleteItem?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        loading={deleteItemMutation.isPending}
        onConfirm={() => deleteItem && deleteItemMutation.mutate(deleteItem.id)}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  );
}

function MenuItemDialog({
  restaurantId,
  item,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  item: MenuItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const isEdit = Boolean(item);

  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price.replace(',', '.')),
        category: category.trim() || null,
        isAvailable,
      };
      return isEdit
        ? api.patch<MenuItem>(`/restaurants/${restaurantId}/menu-items/${item!.id}`, body)
        : api.post<MenuItem>(`/restaurants/${restaurantId}/menu-items`, body);
    },
    onSuccess: () => {
      toast.success(isEdit ? t('admin.menu.updated') : t('admin.menu.created'));
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
          'name',
          'description',
          'price',
          'category',
        ]);
        setFieldErrors(fe);
        setGeneralErrors(general);
      } else {
        toast.error(errorToMessage(error, t));
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralErrors([]);
    const parsed = Number(price.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setFieldErrors({ price: t('admin.menu.priceInvalid') });
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? t('admin.menu.editTitle') : t('admin.menu.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="menu-item-form" loading={mutation.isPending}>
            {isEdit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <FormErrors errors={generalErrors} />
      <form id="menu-item-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label={t('admin.menu.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Textarea
          label={t('admin.menu.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
          rows={2}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('admin.menu.priceEuro')}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={fieldErrors.price}
          />
          <Input
            label={t('admin.menu.category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            error={fieldErrors.category}
            placeholder={t('admin.menu.categoryPlaceholder')}
          />
        </div>
        <Switch
          checked={isAvailable}
          onChange={setIsAvailable}
          label={t('admin.menu.available')}
          description={t('admin.menu.availableHint')}
        />
      </form>
    </Dialog>
  );
}

function ImportMenuDialog({
  restaurant,
  onClose,
  onImported,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ImportResult>(
        `/restaurants/${restaurant.id}/import-menu`,
        url.trim() ? { url: url.trim() } : undefined,
      ),
    onSuccess: (result) => {
      toast.success(
        t('admin.menu.importResult', { imported: result.imported, updated: result.updated }),
      );
      onImported();
      onClose();
    },
    onError: (err) => setError(errorToMessage(err, t)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    mutation.mutate();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('admin.menu.importTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="import-menu-form" loading={mutation.isPending}>
            <ImportIcon className="h-4 w-4" />
            {t('admin.menu.importConfirm')}
          </Button>
        </>
      }
    >
      <form id="import-menu-form" onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {restaurant.menuUrl
            ? t('admin.menu.importHintWithUrl', { url: restaurant.menuUrl })
            : t('admin.menu.importHintNoUrl')}
        </p>
        <Input
          label={t('admin.menu.importUrlOverride')}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/menu.json"
          error={error}
          hint={t('admin.menu.importUrlOptional')}
        />
      </form>
    </Dialog>
  );
}
