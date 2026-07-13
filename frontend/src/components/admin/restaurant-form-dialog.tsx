'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { splitFieldErrors } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Restaurant } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/** Dialog zum Anlegen (restaurant=null) bzw. Bearbeiten eines Restaurants. */
export function RestaurantFormDialog({
  restaurant,
  onClose,
  onSaved,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const isEdit = Boolean(restaurant);

  const [name, setName] = useState(restaurant?.name ?? '');
  const [description, setDescription] = useState(restaurant?.description ?? '');
  const [cuisine, setCuisine] = useState(restaurant?.cuisine ?? '');
  const [phone, setPhone] = useState(restaurant?.phone ?? '');
  const [website, setWebsite] = useState(restaurant?.website ?? '');
  const [menuUrl, setMenuUrl] = useState(restaurant?.menuUrl ?? '');
  const [isActive, setIsActive] = useState(restaurant?.isActive ?? true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        cuisine: cuisine.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        menuUrl: menuUrl.trim() || null,
        ...(isEdit ? { isActive } : {}),
      };
      return isEdit
        ? api.patch<Restaurant>(`/restaurants/${restaurant!.id}`, body)
        : api.post<Restaurant>('/restaurants', body);
    },
    onSuccess: () => {
      toast.success(isEdit ? t('admin.restaurants.updated') : t('admin.restaurants.created'));
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
          'name',
          'description',
          'cuisine',
          'phone',
          'website',
          'menuUrl',
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
    mutation.mutate();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? t('admin.restaurants.editTitle') : t('admin.restaurants.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="restaurant-form" loading={mutation.isPending}>
            {isEdit ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <FormErrors errors={generalErrors} />
      <form id="restaurant-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label={t('admin.restaurants.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <Textarea
          label={t('admin.restaurants.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
          rows={2}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('admin.restaurants.cuisine')}
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            error={fieldErrors.cuisine}
            placeholder={t('admin.restaurants.cuisinePlaceholder')}
          />
          <Input
            label={t('admin.restaurants.phone')}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldErrors.phone}
          />
        </div>
        <Input
          label={t('admin.restaurants.website')}
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          error={fieldErrors.website}
          placeholder="https://…"
        />
        <Input
          label={t('admin.restaurants.menuUrl')}
          type="url"
          value={menuUrl}
          onChange={(e) => setMenuUrl(e.target.value)}
          error={fieldErrors.menuUrl}
          hint={t('admin.restaurants.menuUrlHint')}
          placeholder="https://…/menu.json"
        />
        {isEdit ? (
          <Switch
            checked={isActive}
            onChange={setIsActive}
            label={t('admin.restaurants.isActive')}
            description={t('admin.restaurants.isActiveHint')}
          />
        ) : null}
      </form>
    </Dialog>
  );
}
