"use client";

import {
  type CircuitDetail,
  circuitSchema,
  DEFAULT_POINTS_TABLE,
  PLACEMENTS,
  type PointsTable,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Pencil, Plus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

/** Create a circuit, or rename it, change its points table and add categories. */
function CircuitSheet({
  circuit,
  open,
  onOpenChange,
}: {
  /** Null to create. */
  circuit: CircuitDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("tournaments.circuitForm");
  const placements = useTranslations("tournaments.placement");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [points, setPoints] = useState<PointsTable>(DEFAULT_POINTS_TABLE);
  const [categories, setCategories] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(circuit?.name ?? "");
    setSeason(circuit?.season ?? String(new Date().getFullYear()));
    setPoints(circuit?.pointsTable ?? DEFAULT_POINTS_TABLE);
    setCategories("");
    setTouched(false);
    // Reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categoryNames = categories
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const check = circuitSchema.safeParse({
    name,
    season,
    pointsTable: points,
    categories: circuit ? (categoryNames.length > 0 ? categoryNames : ["—"]) : categoryNames,
  });
  const issue = (field: string) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path[0] === field);
    return found ? issueMessage(found) : undefined;
  };

  const save = useMutation({
    mutationFn: () =>
      circuit
        ? api.circuits.update(circuit.id, {
            name,
            season,
            pointsTable: points,
            ...(categoryNames.length > 0 ? { addCategories: categoryNames } : {}),
          })
        : api.circuits.create({ name, season, pointsTable: points, categories: categoryNames }),
    onSuccess: (saved) => {
      toast.success(circuit ? t("saved") : t("created"));
      client.setQueryData(queryKeys.circuit(saved.id), saved);
      void client.invalidateQueries({ queryKey: queryKeys.circuits });
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={circuit ? t("editTitle") : t("createTitle")}
      footer={
        <Button
          size="lg"
          block
          loading={save.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success) save.mutate();
          }}
        >
          {circuit ? t("save") : t("create")}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label={t("name")} htmlFor="circuit-name" error={issue("name")}>
            <Input
              id="circuit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t("season")} htmlFor="circuit-season" error={issue("season")}>
            <Input
              id="circuit-season"
              className="num"
              value={season}
              onChange={(event) => setSeason(event.target.value)}
            />
          </Field>
        </div>
        <Field
          label={circuit ? t("addCategories") : t("categories")}
          htmlFor="circuit-categories"
          error={issue("categories")}
          hint={t("categoriesHint")}
        >
          <Textarea
            id="circuit-categories"
            value={categories}
            placeholder={t("categoriesPlaceholder")}
            onChange={(event) => setCategories(event.target.value)}
          />
        </Field>
        {circuit ? (
          <p className="text-caption text-muted-foreground">
            {t("existing", {
              names: circuit.categories.map((category) => category.name).join(", "),
            })}
          </p>
        ) : null}
        <section className="space-y-2">
          <SectionLabel>{t("points")}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {PLACEMENTS.map((placement) => (
              <Field key={placement} label={placements(placement)} htmlFor={`points-${placement}`}>
                <Input
                  id={`points-${placement}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="num"
                  value={points[placement]}
                  onChange={(event) =>
                    setPoints((current) => ({
                      ...current,
                      [placement]: Number(event.target.value),
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          {issue("pointsTable") ? (
            <p className="text-small text-danger-ink">{issue("pointsTable")}</p>
          ) : null}
        </section>
      </div>
    </Sheet>
  );
}

export default function AdminCircuitsPage() {
  const t = useTranslations("tournaments.circuitAdmin");
  const client = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.circuits, queryFn: api.circuits.list });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CircuitDetail | null>(null);

  async function edit(id: string) {
    const detail = await client.fetchQuery({
      queryKey: queryKeys.circuit(id),
      queryFn: () => api.circuits.get(id),
    });
    setEditing(detail);
    setOpen(true);
  }

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus />
            {t("create")}
          </Button>
        }
      />
      <div className="mt-5">
        {list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.isLoading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.data!.map((circuit, index) => (
              <motion.li
                key={circuit.id}
                custom={index}
                variants={listItemVariants}
                initial="hidden"
                animate="show"
              >
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/circuits/${circuit.id}`}
                      className="min-w-0 hover:underline"
                    >
                      <p className="font-display text-title font-semibold">{circuit.name}</p>
                      <p className="text-caption text-muted-foreground">
                        {t("summary", { season: circuit.season, count: circuit.stages.length })}
                      </p>
                    </Link>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("edit")}
                      onClick={() => void edit(circuit.id)}
                    >
                      <Pencil />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {circuit.categories.map((category) => (
                      <Badge key={category.id}>{category.name}</Badge>
                    ))}
                  </div>
                </Card>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
      <CircuitSheet circuit={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}
