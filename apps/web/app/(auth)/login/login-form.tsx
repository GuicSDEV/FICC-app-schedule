"use client";

import { formatMembershipId, loginSchema, type Role } from "@ficc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { motion, useAnimate } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { api, ApiError } from "@/lib/api";
import { haptic, sheetVariants, shakeAnimation } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { AREA_BY_ROLE, AREA_ROLES } from "@/lib/roles";

type Kind = "member" | "staff";

function destination(role: Role, next: string | null): string {
  const area = next
    ? Object.keys(AREA_ROLES).find((prefix) => next === prefix || next.startsWith(`${prefix}/`))
    : undefined;
  return next && area && AREA_ROLES[area]!.includes(role) ? next : AREA_BY_ROLE[role];
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
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
      setError(parsed.error.issues[0]?.message ?? "Confira os dados");
      void animate(scope.current, shakeAnimation);
      return;
    }
    setPending(true);
    try {
      const user = await api.auth.login(parsed.data);
      haptic();
      client.setQueryData(queryKeys.me, user);
      router.replace(destination(user.role, params.get("next")));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível entrar.");
      void animate(scope.current, shakeAnimation);
      setPending(false);
    }
  }

  return (
    <motion.div
      variants={sheetVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-sm"
    >
      <div className="mb-8 space-y-3">
        <h1 className="font-display text-display leading-[1.05] font-bold sm:text-hero">
          A quadra
          <br />
          <span className="text-accent-ink">te espera.</span>
        </h1>
        <p className="text-body text-muted-foreground">
          Reserve, jogue e suba no ranking do clube.
        </p>
      </div>

      <form
        ref={scope}
        onSubmit={onSubmit}
        noValidate
        className="space-y-5 rounded-2xl border border-border bg-surface/80 p-5 shadow-raised backdrop-blur-sm"
      >
        <SegmentedControl
          label="Tipo de acesso"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setError(null);
          }}
          options={[
            { value: "member", label: "Sócio" },
            { value: "staff", label: "Equipe" },
          ]}
        />

        {kind === "member" ? (
          <Field label="Matrícula" htmlFor="membershipId">
            <Input
              id="membershipId"
              inputMode="numeric"
              autoComplete="username"
              placeholder="000.000"
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
          <Field label="E-mail" htmlFor="email">
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="voce@ficc.test"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
            />
          </Field>
        )}

        <Field label="Senha" htmlFor="password" error={error ?? undefined}>
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
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" block loading={pending}>
          Entrar
        </Button>
      </form>

      {kind === "member" ? (
        <p className="mt-5 text-center text-small text-muted-foreground">
          Primeiro acesso?{" "}
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-4 hover:underline"
          >
            Criar conta com a matrícula
          </Link>
        </p>
      ) : null}
    </motion.div>
  );
}
