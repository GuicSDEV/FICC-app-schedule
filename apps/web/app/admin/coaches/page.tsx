"use client";

import {
  type CoachAdminItem,
  type CourtSummary,
  createCoachSchema,
  updateCoachSchema,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChoiceChip } from "@/components/ui/choice-chip";
import { Field, FieldError, Input, Label } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

/** Suggested coach colors (lesson chips use them as the coach's ring). */
const PALETTE = [
  "#8B7CF6",
  "#4F8A68",
  "#D2603A",
  "#3B82F6",
  "#E0A526",
  "#DB5C8E",
  "#14B8A6",
  "#64748B",
];

const FIELDS = ["name", "displayName", "email", "password", "color", "courtIds"] as const;
type Errors = Partial<Record<(typeof FIELDS)[number] | "form", string>>;

function CoachSheet({
  coach,
  open,
  onOpenChange,
  courts,
}: {
  /** Null to create a new coach. */
  coach: CoachAdminItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courts: CourtSummary[];
}) {
  const t = useTranslations("admin.coaches");
  const labels = useTranslations("labels");
  const client = useQueryClient();
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState(PALETTE[0]!);
  const [courtIds, setCourtIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (!open) return;
    setName(coach?.name ?? "");
    setDisplayName(coach?.displayName ?? "");
    setEmail(coach?.email ?? "");
    setPassword("");
    setColor(coach?.color ?? PALETTE[0]!);
    setCourtIds(coach?.courtIds ?? []);
    setActive(coach?.isActive ?? true);
    setErrors({});
  }, [open, coach]);

  const save = useMutation({
    mutationFn: async () => {
      if (!coach) {
        const parsed = createCoachSchema.safeParse({
          name,
          displayName,
          email,
          password,
          color,
          courtIds,
        });
        if (!parsed.success) throw parsed.error;
        return api.admin.createCoach(parsed.data);
      }
      const changes = {
        ...(name !== coach.name ? { name } : {}),
        ...(displayName !== coach.displayName ? { displayName } : {}),
        ...(color.toUpperCase() !== coach.color.toUpperCase() ? { color } : {}),
        ...(courtIds.slice().sort().join() !== coach.courtIds.slice().sort().join()
          ? { courtIds }
          : {}),
        ...(active !== coach.isActive ? { isActive: active } : {}),
        ...(password ? { password } : {}),
      };
      const parsed = updateCoachSchema.safeParse(changes);
      if (!parsed.success) throw parsed.error;
      return api.admin.updateCoach(coach.id, parsed.data);
    },
    onSuccess: () => {
      haptic();
      toast.success(coach ? t("saved") : t("created"));
      void client.invalidateQueries({ queryKey: queryKeys.admin.coaches });
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
      onOpenChange(false);
    },
    onError: (failure) => {
      if (failure && typeof failure === "object" && "issues" in failure) {
        const next: Errors = {};
        for (const issue of (failure as { issues: { path: PropertyKey[]; message: string }[] })
          .issues) {
          const field = FIELDS.find((candidate) => candidate === issue.path[0]) ?? "form";
          next[field] ??= issueMessage(issue);
        }
        setErrors(next);
        return;
      }
      const message = errorMessage(failure, t("saveFailed"));
      setErrors({ form: message });
      toast.error(message);
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={coach ? t("editTitle", { name: coach.displayName }) : t("newTitle")}
      footer={
        <Button block size="lg" loading={save.isPending} onClick={() => save.mutate()}>
          {coach ? t("save") : t("create")}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <Avatar name={displayName || name || "?"} ring={color} />
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName || t("previewName")}</p>
            <p className="truncate text-small text-muted-foreground">{t("previewHint")}</p>
          </div>
        </div>
        <Field label={t("name")} htmlFor="coach-name" error={errors.name}>
          <Input
            id="coach-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field
          label={t("displayName")}
          htmlFor="coach-display"
          error={errors.displayName}
          hint={t("displayNameHint")}
        >
          <Input
            id="coach-display"
            value={displayName}
            maxLength={40}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
          />
        </Field>
        {coach ? null : (
          <Field label={t("email")} htmlFor="coach-email" error={errors.email}>
            <Input
              id="coach-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
            />
          </Field>
        )}
        <Field
          label={coach ? t("newPassword") : t("password")}
          htmlFor="coach-password"
          error={errors.password}
          hint={coach ? t("newPasswordHint") : undefined}
        >
          <Input
            id="coach-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <div className="space-y-2">
          <Label>{t("color")}</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("color")}>
            {PALETTE.map((value) => (
              <motion.button
                key={value}
                type="button"
                role="radio"
                aria-checked={color.toUpperCase() === value}
                aria-label={value}
                whileTap={tap}
                onClick={() => setColor(value)}
                className={cn(
                  "size-11 rounded-full border-2 transition-tokens",
                  color.toUpperCase() === value ? "border-foreground" : "border-transparent",
                )}
                style={{ background: value }}
              />
            ))}
          </div>
          {errors.color ? <FieldError>{errors.color}</FieldError> : null}
        </div>
        <div className="space-y-2">
          <Label>{t("courts")}</Label>
          <ChipGroup label={t("courts")}>
            {courts.map((court) => (
              <ChoiceChip
                key={court.id}
                showCheck
                selected={courtIds.includes(court.id)}
                onClick={() =>
                  setCourtIds((current) =>
                    current.includes(court.id)
                      ? current.filter((id) => id !== court.id)
                      : [...current, court.id],
                  )
                }
              >
                {court.name} · {labels(`surface.${court.surface}`)}
              </ChoiceChip>
            ))}
          </ChipGroup>
          {errors.courtIds ? <FieldError>{errors.courtIds}</FieldError> : null}
        </div>
        {coach ? (
          <div className="space-y-2">
            <Label>{t("status")}</Label>
            <SegmentedControl
              label={t("status")}
              options={[
                { value: "active", label: t("active") },
                { value: "inactive", label: t("inactive") },
              ]}
              value={active ? "active" : "inactive"}
              onChange={(next) => setActive(next === "active")}
            />
            {!active ? (
              <p className="text-small text-muted-foreground">{t("inactiveHint")}</p>
            ) : null}
          </div>
        ) : null}
        <FieldError>{errors.form}</FieldError>
      </div>
    </Sheet>
  );
}

export default function AdminCoachesPage() {
  const t = useTranslations("admin.coaches");
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const coaches = useQuery({ queryKey: queryKeys.admin.coaches, queryFn: api.admin.coaches });
  const [editing, setEditing] = useState<CoachAdminItem | null>(null);
  const [open, setOpen] = useState(false);
  const courtName = (id: string) =>
    courts.data?.courts.find((court) => court.id === id)?.name ?? "";

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus /> {t("new")}
          </Button>
        }
      />
      <div className="mt-6">
        {coaches.isError ? (
          <ErrorState onRetry={() => void coaches.refetch()} />
        ) : coaches.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (coaches.data ?? []).length === 0 ? (
          <EmptyState icon={GraduationCap} title={t("emptyTitle")} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {coaches.data!.map((coach, index) => (
              <motion.li
                key={coach.id}
                custom={index}
                variants={listItemVariants}
                initial="hidden"
                animate="show"
              >
                <motion.button
                  type="button"
                  whileTap={tap}
                  onClick={() => {
                    setEditing(coach);
                    setOpen(true);
                  }}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left shadow-card transition-tokens hover:bg-surface-2",
                    !coach.isActive && "opacity-60",
                  )}
                >
                  <Avatar
                    name={coach.displayName}
                    src={coach.photoUrl}
                    size="lg"
                    ring={coach.color}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{coach.displayName}</span>
                      {coach.isActive ? null : <Badge className="h-6 px-2">{t("inactive")}</Badge>}
                    </span>
                    <span className="block truncate text-small text-muted-foreground">
                      {coach.email}
                    </span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {coach.courtIds.map(courtName).join(", ")} ·{" "}
                      {t("stats", { lessons: coach.upcomingLessons, series: coach.activeSeries })}
                    </span>
                  </span>
                </motion.button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
      <CoachSheet
        coach={editing}
        open={open}
        onOpenChange={setOpen}
        courts={courts.data?.courts ?? []}
      />
    </>
  );
}
