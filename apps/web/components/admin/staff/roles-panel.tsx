"use client";

import {
  hasPermission,
  type Permission,
  PERMISSIONS,
  staffRoleSchema,
  type StaffRoleItem,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

import { PermissionList } from "./staff-panel";

function RoleSheet({
  open,
  role,
  onOpenChange,
}: {
  open: boolean;
  /** Null to create one. */
  role: StaffRoleItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminStaff.rolesEditor");
  const labels = useTranslations("labels");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions(role?.permissions ?? []);
    setTouched(false);
    setConfirmDelete(false);
    // Reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const input = { name, description, permissions };
  const check = staffRoleSchema.safeParse(input);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.admin.roles });
    void client.invalidateQueries({ queryKey: queryKeys.admin.staff });
    // The current person may hold this role: their own permissions change.
    void client.invalidateQueries({ queryKey: queryKeys.me });
  };
  const save = useMutation({
    mutationFn: () => (role ? api.admin.updateRole(role.id, input) : api.admin.createRole(input)),
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(role ? t("saved") : t("created"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const remove = useMutation({
    mutationFn: () => api.admin.deleteRole(role!.id),
    onSuccess: () => {
      haptic();
      toast.success(t("removed"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={role ? t("editTitle") : t("newTitle")}
      footer={
        <div className="space-y-2">
          <Button
            size="lg"
            block
            loading={save.isPending}
            onClick={() => {
              setTouched(true);
              if (check.success) save.mutate();
            }}
          >
            {t("save")}
          </Button>
          {role ? (
            <Button
              size="lg"
              block
              variant={confirmDelete ? "danger" : "ghost"}
              className={confirmDelete ? undefined : "text-danger-ink"}
              loading={remove.isPending}
              onClick={() => (confirmDelete ? remove.mutate() : setConfirmDelete(true))}
            >
              {confirmDelete ? t("confirmRemove", { count: role.memberCount }) : t("remove")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <Field
          label={t("name")}
          htmlFor="role-name"
          error={
            touched && !check.success
              ? issueMessage(check.error.issues.find((issue) => issue.path[0] === "name"))
              : undefined
          }
        >
          <Input id="role-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t("description")} htmlFor="role-description">
          <Input
            id="role-description"
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <section className="space-y-2">
          <SectionLabel>{t("permissions")}</SectionLabel>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {PERMISSIONS.map((permission) => {
              const on = permissions.includes(permission);
              return (
                <li key={permission}>
                  <motion.button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    whileTap={tap}
                    onClick={() =>
                      setPermissions(
                        on
                          ? permissions.filter((entry) => entry !== permission)
                          : PERMISSIONS.filter(
                              (entry) => entry === permission || permissions.includes(entry),
                            ),
                      )
                    }
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left transition-tokens hover:bg-surface-2"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md border transition-tokens",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong",
                      )}
                    >
                      {on ? <Check className="size-4" /> : null}
                    </span>
                    <span className="text-small">{labels(`permission.${permission}`)}</span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}

/** Roles and what each one may do; only platform managers edit them. */
export function RolesPanel() {
  const t = useTranslations("adminStaff");
  const { user } = useSession();
  const canEdit = hasPermission(user, "PLATFORM_MANAGE");
  const roles = useQuery({ queryKey: queryKeys.admin.roles, queryFn: api.admin.roles });
  const [editing, setEditing] = useState<StaffRoleItem | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-4" aria-label={t("tabs.roles")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-small text-muted-foreground">
          {canEdit ? t("rolesHint") : t("rolesReadOnly")}
        </p>
        {canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> {t("rolesEditor.add")}
          </Button>
        ) : null}
      </div>
      {roles.isError ? (
        <ErrorState onRetry={() => void roles.refetch()} />
      ) : !roles.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : roles.data.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("rolesEmpty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {roles.data.map((role, index) => (
            <motion.li
              key={role.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <motion.button
                type="button"
                whileTap={canEdit ? tap : undefined}
                disabled={!canEdit}
                onClick={() => {
                  setEditing(role);
                  setOpen(true);
                }}
                className="flex h-full w-full flex-col gap-2 rounded-lg border border-border bg-card p-4 text-left shadow-card transition-tokens enabled:hover:bg-surface-2"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{role.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {t("memberCount", { count: role.memberCount })}
                  </span>
                </span>
                {role.description ? (
                  <span className="text-small text-muted-foreground">{role.description}</span>
                ) : null}
                <PermissionList permissions={role.permissions} />
              </motion.button>
            </motion.li>
          ))}
        </ul>
      )}
      <RoleSheet open={open} role={editing} onOpenChange={setOpen} />
    </section>
  );
}
