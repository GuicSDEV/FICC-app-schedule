"use client";

import { announcementSchema, type TournamentDetail } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

import { AnnouncementList } from "../tournament-panels";

/** Post a notice to every entrant (or one category); it is pushed as a notification. */
export function AnnouncementsManager({ tournament }: { tournament: TournamentDetail }) {
  const t = useTranslations("tournaments.announce");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const input = { body, ...(categoryId ? { categoryId } : {}) };
  const check = announcementSchema.safeParse(input);

  const send = useMutation({
    mutationFn: () => api.tournaments.announce(tournament.id, input),
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(t("sent"));
      setBody("");
      setTouched(false);
      void invalidateTournament(client, tournament.id);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <Field
          label={t("body")}
          htmlFor="announce-body"
          error={touched && !check.success ? issueMessage(check.error.issues[0]) : undefined}
        >
          <Textarea
            id="announce-body"
            value={body}
            maxLength={1000}
            placeholder={t("placeholder")}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        {tournament.categories.length > 1 ? (
          <div className="space-y-2">
            <SectionLabel>{t("audience")}</SectionLabel>
            <ChipGroup label={t("audience")}>
              <ChoiceChip selected={categoryId === null} onClick={() => setCategoryId(null)}>
                {t("everyone")}
              </ChoiceChip>
              {tournament.categories.map((category) => (
                <ChoiceChip
                  key={category.id}
                  selected={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </ChoiceChip>
              ))}
            </ChipGroup>
          </div>
        ) : null}
        <Button
          loading={send.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success) send.mutate();
          }}
        >
          <Megaphone />
          {t("send")}
        </Button>
      </Card>
      {tournament.announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title={t("emptyTitle")} />
      ) : (
        <AnnouncementList announcements={tournament.announcements} />
      )}
    </div>
  );
}
