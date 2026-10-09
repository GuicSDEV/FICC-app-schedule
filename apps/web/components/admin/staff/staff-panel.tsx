"use client";

import {
  createStaffSchema,
  hasPermission,
  type Permission,
  permissionsOf,
  type StaffMemberItem,
  type StaffRoleItem,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

/** Role chips; a role granting something the current person lacks cannot be picked. */
function RolePicker({
  roles,
  selected,
  mine,
  onChange,
}: {
  roles: StaffRoleItem[];
  selected: string[];
  mine: readonly Permission[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("adminStaff");
  return (
    <ChipGroup label={t("roles")}>
      {roles.map((role) => {
        const on = selected.includes(role.id);
        const allowed = role.permissions.every((permission) => mine.includes(permission));
        return (
          <ChoiceChip
            key={role.id}
            selected={on}
            showCheck
            disabled={!allowed && !on}
            onClick={() =>
              onChange(on ? selected.filter((id) => id !== role.id) : [...selected, role.id])
            }
          >
            {role.name}
          </ChoiceChip>
        );
      })}
    </ChipGroup>
  );
}

function PermissionList({ permissions }: { permissions: Permission[] }) {
  const t = useTranslations("adminStaff");
  const labels = useTranslations("labels");
  if (permissions.length === 0) {
    return <p className="text-small text-muted-foreground">{t("noPermissions")}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {permissions.map((permission) => (
        <li key={permission}>
          <Badge className="h-6 px-2">{labels(`permission.${permission}`)}</Badge>
        </li>
      ))}
    </ul>
  );
}

function StaffSheet({
  person,
  roles,
  onOpenChange,
}: {
  person: StaffMemberItem | null;
  roles: StaffRoleItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminStaff");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const { user } = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (person) setSelected(person.roles.map((role) => role.id));
  }, [person]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.admin.staff });
    void client.invalidateQueries({ queryKey: queryKeys.admin.roles });
    if (person?.id === user?.id) void client.invalidateQueries({ queryKey: queryKeys.me });
  };
  const saveRoles = useMutation({
    mutationFn: () => api.admin.setStaffRoles(person!.id, selected),
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(t("rolesSaved"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const toggleActive = useMutation({
    mutationFn: () => api.admin.setStaffActive(person!.id, !person!.isActive),
    onSuccess: (saved) => {
      haptic();
      toast.success(saved.isActive ? t("reactivated") : t("deactivated"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const preview = permissionsOf(roles.filter((role) => selected.includes(role.id)));

  return (
    <Sheet
      open={person !== null}
      onOpenChange={onOpenChange}
      title={person?.name ?? ""}
      description={person?.email ?? undefined}
      footer={
        <div className="space-y-2">
          <Button size="lg" block loading={saveRoles.isPending} onClick={() => saveRoles.mutate()}>
            {t("saveRoles")}
          </Button>
          {person && person.id !== user?.id ? (
            <Button
              size="lg"
              block
              variant={person.isActive ? "dangerSoft" : "secondary"}
              loading={toggleActive.isPending}
              onClick={() => toggleActive.mutate()}
            >
              {person.isActive ? t("deactivate") : t("reactivate")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <SectionLabel>{t("roles")}</SectionLabel>
          <RolePicker
            roles={roles}
            selected={selected}
            mine={user?.permissions ?? []}
            onChange={setSelected}
          />
          <p className="text-caption text-muted-foreground">{t("grantHint")}</p>
        </section>
        <section className="space-y-2">
          <SectionLabel>{t("resultingPermissions")}</SectionLabel>
          <PermissionList permissions={preview} />
        </section>
      </div>
    </Sheet>
  );
}

function CreateStaffSheet({
  open,
  roles,
  onOpenChange,
}: {
  open: boolean;
  roles: StaffRoleItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminStaff");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const { user } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setRoleIds([]);
    setTouched(false);
  }, [open]);

  const input = { name, email, password, roleIds };
  const check = createStaffSchema.safeParse(input);
  const issue = (field: string) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path[0] === field);
    return found ? issueMessage(found) : undefined;
  };
  const create = useMutation({
    mutationFn: () => api.admin.createStaff(input),
    onSuccess: (saved) => {
      haptic([10, 30, 10]);
      toast.success(t("created", { name: saved.name }));
      void client.invalidateQueries({ queryKey: queryKeys.admin.staff });
      void client.invalidateQueries({ queryKey: queryKeys.admin.roles });
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("newTitle")}
      description={t("newHint")}
      footer={
        <Button
          size="lg"
          block
          loading={create.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success) create.mutate();
          }}
        >
          {t("create")}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label={t("name")} htmlFor="staff-name" error={issue("name")}>
          <Input
            id="staff-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t("email")} htmlFor="staff-email" error={issue("email")}>
          <Input
            id="staff-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field
          label={t("password")}
          htmlFor="staff-password"
          error={issue("password")}
          hint={t("passwordHint")}
        >
          <Input
            id="staff-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <section className="space-y-2">
          <SectionLabel>{t("roles")}</SectionLabel>
          <RolePicker
            roles={roles}
            selected={roleIds}
            mine={user?.permissions ?? []}
            onChange={setRoleIds}
          />
          {issue("roleIds") ? (
            <p className="text-small text-danger-ink">{issue("roleIds")}</p>
          ) : (
            <p className="text-caption text-muted-foreground">{t("grantHint")}</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}

/** Staff accounts (admin, coaches, gate) and the roles each one holds. */
export function StaffPanel() {
  const t = useTranslations("adminStaff");
  const { user } = useSession();
  const staff = useQuery({ queryKey: queryKeys.admin.staff, queryFn: api.admin.staff });
  const roles = useQuery({ queryKey: queryKeys.admin.roles, queryFn: api.admin.roles });
  const [open, setOpen] = useState<StaffMemberItem | null>(null);
  const [creating, setCreating] = useState(false);
  const canManage = hasPermission(user, "STAFF_MANAGE");

  return (
    <section className="space-y-4" aria-label={t("tabs.people")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-small text-muted-foreground">{t("peopleHint")}</p>
        {canManage ? (
          <Button onClick={() => setCreating(true)} disabled={!roles.data}>
            <Plus /> {t("add")}
          </Button>
        ) : null}
      </div>
      {staff.isError ? (
        <ErrorState onRetry={() => void staff.refetch()} />
      ) : !staff.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : staff.data.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("empty")} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {staff.data.map((person, index) => (
            <motion.li
              key={person.id}
              custom={index}
              variants={listItemVariants}
              initial="hidden"
              animate="show"
            >
              <motion.button
                type="button"
                whileTap={tap}
                onClick={() => setOpen(person)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-tokens hover:bg-surface-2"
              >
                <Avatar name={person.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{person.name}</span>
                    <Badge
                      tone={person.role === "COACH" ? "lesson" : "neutral"}
                      className="h-6 px-2"
                    >
                      {t(`accountType.${person.role}`)}
                    </Badge>
                    {person.isActive ? null : (
                      <Badge tone="danger" className="h-6 px-2">
                        {t("inactive")}
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {person.roles.length > 0
                      ? person.roles.map((role) => role.name).join(", ")
                      : t("noRoles")}
                    {person.email ? ` · ${person.email}` : ""}
                  </span>
                </span>
              </motion.button>
            </motion.li>
          ))}
        </ul>
      )}
      <StaffSheet
        person={open}
        roles={roles.data ?? []}
        onOpenChange={(next) => !next && setOpen(null)}
      />
      <CreateStaffSheet open={creating} roles={roles.data ?? []} onOpenChange={setCreating} />
    </section>
  );
}

export { PermissionList };
