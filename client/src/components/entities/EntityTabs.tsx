// F1.1 — EntityTabs.
//
// Tab strip rendered above the wizard's Scope step. Lets the user see the
// per-entity hour rollup at a glance, switch between entities, and
// add/rename/promote/delete them. Read-only mode hides the editing
// affordances when the persona lacks editDeals.
//
// Backed by the four endpoints + the rollup endpoint we shipped in
// slices 2 + 3:
//   GET    /api/deals/:dealId/entities
//   GET    /api/deals/:dealId/entity-totals
//   POST   /api/deals/:dealId/entities
//   PATCH  /api/deal-entities/:id
//   DELETE /api/deal-entities/:id
//
// Selecting a tab updates `activeEntityId`. Hooking the scope step's
// filter to that selection is intentionally NOT done in this PR — the
// BACKLOG calls out "do NOT rewrite the wizard". A follow-up makes the
// scope step entity-aware once the model is settled.

import { useEffect, useMemo, useState } from "react";
import { Plus, Star, Pencil, Trash2, MoreHorizontal, Loader2, AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useDealEntities,
  useEntityTotals,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

type Entity = {
  id: number;
  dealId: number;
  name: string;
  entityType: string | null;
  jurisdiction: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

type EntityTotal = {
  entityId: number;
  totalHours: number;
};

type Props = {
  dealId: number;
  activeEntityId: number | null;
  onSelect: (id: number) => void;
};

export function EntityTabs({ dealId, activeEntityId, onSelect }: Props) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("editDeals");
  const { data: entitiesRaw, isLoading } = useDealEntities(dealId);
  const { data: totalsRaw } = useEntityTotals(dealId);

  // Stable reference per render — `entitiesRaw || []` would create a new
  // array each render and invalidate the auto-select effect's deps.
  const entities: Entity[] = useMemo(() => entitiesRaw || [], [entitiesRaw]);
  const hoursByEntity = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of (totalsRaw?.entities || []) as EntityTotal[]) m.set(t.entityId, t.totalHours);
    return m;
  }, [totalsRaw]);

  // Auto-select the primary tab on first load (or when the active id no
  // longer exists, e.g. after a delete).
  useEffect(() => {
    if (entities.length === 0) return;
    if (activeEntityId && entities.some(e => e.id === activeEntityId)) return;
    const primary = entities.find(e => e.isPrimary) || entities[0];
    onSelect(primary.id);
  }, [entities, activeEntityId, onSelect]);

  const [showAdd, setShowAdd] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading entities…
      </div>
    );
  }

  return (
    <div className="card p-4 mb-6" data-testid="entity-tabs">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Entities</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {entities.length === 1
              ? "One entity on this deal. Add more for multi-entity engagements (e.g. 1040 + 1120 + 1065)."
              : `${entities.length} entities. Click a tab to view its hour rollup.`}
          </p>
        </div>
        {canEdit && !showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5"
            data-testid="entity-tabs-add"
          >
            <Plus className="w-3.5 h-3.5" /> Add entity
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {entities.map((e) => {
          const isActive = e.id === activeEntityId;
          const hours = hoursByEntity.get(e.id) ?? 0;
          const editing = editingId === e.id;
          if (editing) {
            return (
              <EntityRenameInline
                key={e.id}
                entity={e}
                onClose={() => setEditingId(null)}
              />
            );
          }
          return (
            <div
              key={e.id}
              className={cn(
                "group relative inline-flex items-center gap-2 pl-3 pr-1 py-1.5 rounded-lg border text-xs transition-colors",
                isActive
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/40"
              )}
            >
              <button
                onClick={() => onSelect(e.id)}
                className="inline-flex items-center gap-1.5"
                data-testid={`entity-tab-${e.id}`}
              >
                {e.isPrimary && (
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" aria-label="Primary entity" />
                )}
                <span className="font-medium">{e.name}</span>
                {e.entityType && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-semibold uppercase tracking-wide">
                    {e.entityType}
                  </span>
                )}
                <span className="text-muted-foreground">· {hours}h</span>
              </button>
              {canEdit && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpenFor(menuOpenFor === e.id ? null : e.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                    aria-label="Entity actions"
                    data-testid={`entity-tab-menu-${e.id}`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                  {menuOpenFor === e.id && (
                    <EntityActionMenu
                      entity={e}
                      onClose={() => setMenuOpenFor(null)}
                      onRename={() => { setEditingId(e.id); setMenuOpenFor(null); }}
                      onConfirmDelete={() => { setConfirmDeleteId(e.id); setMenuOpenFor(null); }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <EntityAddForm
          dealId={dealId}
          onClose={() => setShowAdd(false)}
          onCreated={(id) => { onSelect(id); setShowAdd(false); }}
        />
      )}

      {confirmDeleteId !== null && (
        <EntityDeleteConfirm
          entity={entities.find(e => e.id === confirmDeleteId) || null}
          onClose={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

function EntityActionMenu({
  entity, onClose, onRename, onConfirmDelete,
}: {
  entity: Entity;
  onClose: () => void;
  onRename: () => void;
  onConfirmDelete: () => void;
}) {
  const updateEntity = useUpdateEntity();
  const promote = () => {
    updateEntity.mutate({ id: entity.id, dealId: entity.dealId, data: { isPrimary: true } });
    onClose();
  };
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <div className="absolute right-0 top-7 z-40 w-44 rounded-lg border border-border bg-card shadow-lg py-1 text-xs">
        <button
          onClick={onRename}
          className="w-full text-left px-3 py-1.5 hover:bg-muted inline-flex items-center gap-2"
          data-testid={`entity-action-rename-${entity.id}`}
        >
          <Pencil className="w-3 h-3" /> Rename
        </button>
        {!entity.isPrimary && (
          <button
            onClick={promote}
            disabled={updateEntity.isPending}
            className="w-full text-left px-3 py-1.5 hover:bg-muted inline-flex items-center gap-2"
            data-testid={`entity-action-promote-${entity.id}`}
          >
            <Star className="w-3 h-3" /> Set as primary
          </button>
        )}
        <button
          onClick={onConfirmDelete}
          disabled={entity.isPrimary}
          className={cn(
            "w-full text-left px-3 py-1.5 inline-flex items-center gap-2",
            entity.isPrimary
              ? "text-muted-foreground/50 cursor-not-allowed"
              : "text-red-600 hover:bg-red-50"
          )}
          title={entity.isPrimary ? "Cannot delete the primary entity. Promote another first." : undefined}
          data-testid={`entity-action-delete-${entity.id}`}
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>
    </>
  );
}

function EntityRenameInline({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  const [name, setName] = useState(entity.name);
  const [error, setError] = useState<string | null>(null);
  const updateEntity = useUpdateEntity();
  const submit = () => {
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    updateEntity.mutate(
      { id: entity.id, dealId: entity.dealId, data: { name: name.trim() } },
      {
        onSuccess: onClose,
        onError: (e: any) => setError(e?.body?.error || e?.message || "Could not rename"),
      },
    );
  };
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-primary bg-card">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose();
        }}
        maxLength={100}
        className="px-1.5 py-0.5 text-xs bg-transparent outline-none w-40"
        data-testid={`entity-rename-input-${entity.id}`}
      />
      <button onClick={submit} disabled={updateEntity.isPending} className="p-1 rounded hover:bg-emerald-50 text-emerald-600">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <X className="w-3.5 h-3.5" />
      </button>
      {error && (
        <span className="text-[11px] text-red-600 ml-2 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}

function EntityAddForm({
  dealId, onClose, onCreated,
}: {
  dealId: number;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const createEntity = useCreateEntity();
  const submit = () => {
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    createEntity.mutate(
      {
        dealId,
        data: {
          name: name.trim(),
          entityType: entityType.trim() || null,
          jurisdiction: jurisdiction.trim() || null,
        },
      },
      {
        onSuccess: (row: any) => onCreated(row.id),
        onError: (e: any) => setError(e?.body?.error || e?.message || "Could not create entity"),
      },
    );
  };
  return (
    <div className="mt-3 p-3 border border-dashed border-primary/40 rounded-lg bg-primary/5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (required) — e.g. Form 1040"
          maxLength={100}
          className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-card"
          data-testid="entity-add-name"
        />
        <input
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="Type (optional) — 1040, 1120, 1065…"
          maxLength={32}
          className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-card"
          data-testid="entity-add-type"
        />
        <input
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value)}
          placeholder="Jurisdiction (optional) — US-DE, UK-LDN…"
          maxLength={64}
          className="px-2.5 py-1.5 text-xs rounded-md border border-border bg-card"
          data-testid="entity-add-jurisdiction"
        />
      </div>
      <div className="flex items-center justify-between">
        {error ? (
          <span className="text-[11px] text-red-600 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Press Enter to create, Esc to cancel.
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-2.5 py-1 text-xs rounded-md text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={createEntity.isPending}
            className="px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            data-testid="entity-add-submit"
          >
            {createEntity.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntityDeleteConfirm({
  entity, onClose,
}: {
  entity: Entity | null;
  onClose: () => void;
}) {
  const deleteEntity = useDeleteEntity();
  const [error, setError] = useState<string | null>(null);
  if (!entity) return null;
  const submit = () => {
    setError(null);
    deleteEntity.mutate(
      { id: entity.id, dealId: entity.dealId },
      {
        onSuccess: onClose,
        onError: (e: any) => {
          const code = e?.body?.code;
          if (code === "entity_has_children") {
            const counts = e.body;
            setError(`Reassign ${counts.scopeItemCount} scope item${counts.scopeItemCount === 1 ? "" : "s"} and ${counts.pricingLineCount} pricing line${counts.pricingLineCount === 1 ? "" : "s"} first.`);
          } else if (code === "primary_entity_protected") {
            setError("Cannot delete the primary entity. Promote another first.");
          } else {
            setError(e?.body?.error || e?.message || "Delete failed");
          }
        },
      },
    );
  };
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[90vw] bg-card border border-border rounded-xl shadow-xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Delete entity?</h3>
        <p className="text-xs text-muted-foreground mb-4">
          This permanently removes <span className="font-medium text-foreground">{entity.name}</span>. The entity must have no scope items or pricing lines pointed at it.
        </p>
        {error && (
          <div className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-[11px] text-red-700 inline-flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={deleteEntity.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            data-testid={`entity-delete-confirm-${entity.id}`}
          >
            {deleteEntity.isPending ? "Deleting…" : "Delete entity"}
          </button>
        </div>
      </div>
    </>
  );
}
