'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { errorToMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { splitFieldErrors, useDebouncedValue } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import type { Locale, Paginated, Role, User } from '@/lib/types';
import { FormErrors } from '@/components/auth-page';
import { KeyIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, UsersIcon } from '@/components/icons';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 300);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const query = useQuery({
    queryKey: ['users', { page, search }],
    queryFn: () =>
      api.get<Paginated<User>>(
        `/users?search=${encodeURIComponent(search)}&page=${page}&limit=${PAGE_SIZE}`,
      ),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['users'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      invalidate();
      setDeleteUser(null);
      toast.success(t('admin.users.deleted'));
    },
    onError: (error) => toast.error(errorToMessage(error, t)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {t('admin.users.title')}
        </h2>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon className="h-4 w-4" />
          {t('admin.users.createButton')}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          aria-label={t('admin.users.searchLabel')}
          placeholder={t('admin.users.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          className="[&>input]:pl-9"
        />
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-7 w-7" />}
          title={t('admin.users.empty')}
          description={search ? t('admin.users.emptySearch', { search }) : undefined}
        />
      ) : (
        <>
          <Table>
            <THead>
              <Tr>
                <Th>{t('admin.users.name')}</Th>
                <Th>{t('auth.email')}</Th>
                <Th>{t('admin.users.role')}</Th>
                <Th>{t('admin.users.status')}</Th>
                <Th>{t('admin.users.createdAt')}</Th>
                <Th className="text-right">{t('common.actions')}</Th>
              </Tr>
            </THead>
            <TBody>
              {query.data.items.map((user) => (
                <Tr key={user.id}>
                  <Td className="font-medium text-gray-900 dark:text-gray-100">
                    {user.firstName} {user.lastName}
                  </Td>
                  <Td>{user.email}</Td>
                  <Td>
                    <Badge color={user.role === 'ADMIN' ? 'violet' : 'gray'}>
                      {t(`role.${user.role}`)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge color={user.isActive ? 'green' : 'red'}>
                      {user.isActive ? t('common.active') : t('common.inactive')}
                    </Badge>
                  </Td>
                  <Td>{formatDate(user.createdAt, locale)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        size="sm"
                        aria-label={t('admin.users.editLabel', { name: user.firstName })}
                        onClick={() => setEditUser(user)}
                      >
                        <PencilIcon className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        aria-label={t('admin.users.resetLabel', { name: user.firstName })}
                        onClick={() => setResetUser(user)}
                      >
                        <KeyIcon className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        aria-label={t('admin.users.deleteLabel', { name: user.firstName })}
                        onClick={() => setDeleteUser(user)}
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
          <Pagination
            page={page}
            total={query.data.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      {createOpen ? <CreateUserDialog onClose={() => setCreateOpen(false)} onSaved={invalidate} /> : null}
      {editUser ? (
        <EditUserDialog user={editUser} onClose={() => setEditUser(null)} onSaved={invalidate} />
      ) : null}
      {resetUser ? (
        <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteUser)}
        title={t('admin.users.deleteTitle')}
        message={t('admin.users.deleteMessage', {
          name: deleteUser ? `${deleteUser.firstName} ${deleteUser.lastName}` : '',
        })}
        confirmLabel={t('common.delete')}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
        onCancel={() => setDeleteUser(null)}
      />
    </div>
  );
}

function CreateUserDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [userLocale, setUserLocale] = useState<Locale>('de');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<User>('/users', { email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), password, role, locale: userLocale }),
    onSuccess: () => {
      toast.success(t('admin.users.created'));
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const { fieldErrors: fe, general } = splitFieldErrors(error.messages, [
          'email',
          'firstName',
          'lastName',
          'password',
          'role',
          'locale',
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
      title={t('admin.users.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-user-form" loading={mutation.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <FormErrors errors={generalErrors} />
      <form id="create-user-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label={t('auth.email')}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('auth.firstName')}
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={fieldErrors.firstName}
          />
          <Input
            label={t('auth.lastName')}
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={fieldErrors.lastName}
          />
        </div>
        <Input
          label={t('auth.password')}
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={t('auth.passwordPolicy')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('admin.users.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="USER">{t('role.USER')}</option>
            <option value="ADMIN">{t('role.ADMIN')}</option>
          </Select>
          <Select
            label={t('settings.appearance.language')}
            value={userLocale}
            onChange={(e) => setUserLocale(e.target.value as Locale)}
          >
            <option value="de">{t('language.de')}</option>
            <option value="en">{t('language.en')}</option>
          </Select>
        </div>
      </form>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [userLocale, setUserLocale] = useState<Locale>(user.locale);
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<User>(`/users/${user.id}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        isActive,
        locale: userLocale,
      }),
    onSuccess: () => {
      toast.success(t('admin.users.updated'));
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) setGeneralErrors(error.messages);
      else toast.error(errorToMessage(error, t));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setGeneralErrors([]);
    mutation.mutate();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('admin.users.editTitle', { name: `${user.firstName} ${user.lastName}` })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="edit-user-form" loading={mutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <FormErrors errors={generalErrors} />
      <form id="edit-user-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('auth.firstName')}
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label={t('auth.lastName')}
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t('admin.users.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="USER">{t('role.USER')}</option>
            <option value="ADMIN">{t('role.ADMIN')}</option>
          </Select>
          <Select
            label={t('settings.appearance.language')}
            value={userLocale}
            onChange={(e) => setUserLocale(e.target.value as Locale)}
          >
            <option value="de">{t('language.de')}</option>
            <option value="en">{t('language.en')}</option>
          </Select>
        </div>
        <Switch
          checked={isActive}
          onChange={setIsActive}
          label={t('admin.users.isActive')}
          description={t('admin.users.isActiveHint')}
        />
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reset-password`, { newPassword }),
    onSuccess: () => {
      toast.success(t('admin.users.passwordReset'));
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
      title={t('admin.users.resetTitle', { name: `${user.firstName} ${user.lastName}` })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="reset-password-form" loading={mutation.isPending}>
            {t('admin.users.resetButton')}
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={submit} noValidate>
        <Input
          label={t('settings.password.new')}
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={error}
          hint={t('auth.passwordPolicy')}
        />
      </form>
    </Dialog>
  );
}
