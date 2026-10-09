"use client";

import { formatMembershipId, registerSchema } from "@ficc/shared";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useAnimate } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { haptic, sheetVariants, shakeAnimation } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

type Errors = Partial<Record<"membershipId" | "name" | "password" | "form", string>>;

export function RegisterForm() {
  const router = useRouter();
  const client = useQueryClient();
  const [scope, animate] = useAnimate();
  const [membershipId, setMembershipId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse({ membershipId, name, password });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(next);
      void animate(scope.current, shakeAnimation);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const user = await api.auth.register(parsed.data);
      haptic();
      client.setQueryData(queryKeys.me, user);
      router.replace("/app");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Não foi possível criar a conta.";
      setErrors(caught instanceof ApiError && caught.code.startsWith("MEMBERSHIP") ? { membershipId: message } : { form: message });
      void animate(scope.current, shakeAnimation);
      setPending(false);
    }
  }

  return (
    <motion.div variants={sheetVariants} initial="hidden" animate="show" className="w-full max-w-sm">
      <div className="mb-8 space-y-3">
        <h1 className="font-display text-display font-bold leading-[1.05]">
          Primeiro <span className="text-accent-ink">saque.</span>
        </h1>
        <p className="text-body text-muted-foreground">Use a matrícula do clube para criar seu acesso.</p>
      </div>
      <form
        ref={scope}
        onSubmit={onSubmit}
        noValidate
        className="space-y-5 rounded-2xl border border-border bg-surface/80 p-5 shadow-raised backdrop-blur-sm"
      >
        <Field label="Matrícula" htmlFor="membershipId" error={errors.membershipId}>
          <Input
            id="membershipId"
            inputMode="numeric"
            autoComplete="username"
            placeholder="000.000"
            value={membershipId}
            onChange={(event) => setMembershipId(formatMembershipId(event.target.value).slice(0, 13))}
            aria-invalid={Boolean(errors.membershipId) || undefined}
            className="num text-title tracking-wider"
            autoFocus
          />
        </Field>
        <Field label="Nome completo" htmlFor="name" error={errors.name}>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name) || undefined}
          />
        </Field>
        <Field label="Senha" htmlFor="password" error={errors.password ?? errors.form} hint="Pelo menos 8 caracteres.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(errors.password) || undefined}
          />
        </Field>
        <Button type="submit" size="lg" block loading={pending}>
          Criar conta
        </Button>
      </form>
      <p className="mt-5 text-center text-small text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </motion.div>
  );
}
