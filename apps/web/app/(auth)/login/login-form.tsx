"use client";

import { formatMembershipId, loginSchema, type Role } from "@ficc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useAnimate } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { api } from "@/lib/api";
import { haptic, shakeAnimation } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { AREA_BY_ROLE, AREA_ROLES } from "@/lib/roles";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

type Kind = "member" | "staff";

function destination(role: Role, next: string | null): string {
  const area = next
    ? Object.keys(AREA_ROLES).find((prefix) => next === prefix || next.startsWith(`${prefix}/`))
    : undefined;
  return next && area && AREA_ROLES[area]!.includes(role) ? next : AREA_BY_ROLE[role];
}

/** `next`: where to go after login (from the URL, read by the server page). */
export function LoginForm({ next }: { next: string | null }) {
  const t = useTranslations("auth.login");
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const client = useQueryClient();
  const [scope, animate] = useAnimate();
  const [kind, setKind] = useState<Kind>("member");
  const [membershipId, setMembershipId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse(
      kind === "member" ? { kind, membershipId, password } : { kind, email, password },
    );
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      void animate(scope.current, shakeAnimation);
      return;
    }
    setPending(true);
    try {
      const user = await api.auth.login(parsed.data);
      haptic();
      client.setQueryData(queryKeys.me, user);
      router.replace(destination(user.role, next));
    } catch (caught) {
      setError(errorMessage(caught, t("failed")));
      void animate(scope.current, shakeAnimation);
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm animate-sheet-in">
      <div className="mb-8 space-y-3">
        <h1 className="font-display text-display leading-[1.05] font-bold sm:text-hero">
          {t("headline")}
          <br />
          <span className="text-accent-ink">{t("headlineAccent")}</span>
        </h1>
        <p className="text-body text-muted-foreground">{t("lead")}</p>
      </div>

      <form
        ref={scope}
        onSubmit={onSubmit}
        noValidate
        className="space-y-5 rounded-2xl border border-border bg-surface/80 p-5 shadow-raised backdrop-blur-sm"
      >
        <SegmentedControl
          label={t("kindLabel")}
          value={kind}
          onChange={(value) => {
            setKind(value);
            setError(null);
          }}
          options={[
            { value: "member", label: t("member") },
            { value: "staff", label: t("staff") },
          ]}
        />

        {kind === "member" ? (
          <Field label={t("membershipId")} htmlFor="membershipId">
            <Input
              id="membershipId"
              inputMode="numeric"
              autoComplete="username"
              placeholder={t("membershipPlaceholder")}
              value={membershipId}
              onChange={(event) =>
                setMembershipId(formatMembershipId(event.target.value).slice(0, 13))
              }
              aria-invalid={Boolean(error) || undefined}
              className="num text-title tracking-wider"
              autoFocus
            />
          </Field>
        ) : (
          <Field label={t("email")} htmlFor="email">
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder={t("emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
            />
          </Field>
        )}

        <Field label={t("password")} htmlFor="password" error={error ?? undefined}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              className="pr-14"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              className="absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" block loading={pending}>
          {t("submit")}
        </Button>
      </form>

      {kind === "member" ? (
        <p className="mt-5 text-center text-small text-muted-foreground">
          {t("firstAccess")}{" "}
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-4 hover:underline"
          >
            {t("createAccount")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
