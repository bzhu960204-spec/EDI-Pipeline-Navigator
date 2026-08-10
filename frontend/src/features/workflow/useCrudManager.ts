import { App as AntApp } from 'antd';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { extractErrorMessage } from '../../api/client';

interface CrudManagerConfig<P> {
  /** Singular, capitalised label used in toasts, e.g. "Role". */
  label: string;
  create: (payload: P) => Promise<unknown>;
  update: (id: number, payload: P) => Promise<unknown>;
  remove: (id: number) => Promise<void>;
  invalidateKeys: QueryKey[];
  /** Called after a successful create/update (e.g. to reset the form). */
  onSaved?: () => void;
}

/** Shared create/update/delete boilerplate for the workflow manager panels. */
export function useCrudManager<P>(config: CrudManagerConfig<P>) {
  const { message } = AntApp.useApp();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const lower = config.label.toLowerCase();

  const invalidate = () =>
    config.invalidateKeys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));

  const save = useMutation({
    mutationFn: (payload: P) =>
      editingId ? config.update(editingId, payload) : config.create(payload),
    onSuccess: () => {
      message.success(`${config.label} ${editingId ? 'updated' : 'created'}`);
      setEditingId(null);
      invalidate();
      config.onSaved?.();
    },
    onError: (e) => message.error(extractErrorMessage(e, `Failed to save ${lower}`)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => config.remove(id),
    onSuccess: () => {
      message.success(`${config.label} deleted`);
      invalidate();
    },
    onError: (e) => message.error(extractErrorMessage(e, `Failed to delete ${lower}`)),
  });

  return { editingId, setEditingId, save, remove };
}

type ColorLike = { toHexString: () => string };

/** Normalises AntD ColorPicker output (string or object) to a hex string. */
export function normalizeColor(value: string | ColorLike | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toHexString();
}
