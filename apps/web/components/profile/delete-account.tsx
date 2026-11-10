"use client";

import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useLogout } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { haptic } from "@/lib/motion";
import { useErrorMessage } from "@/lib/use-error-message";

/**
 * "Excluir minha conta" (App Store / Google Play rule, LGPD): explains what happens, asks for the
 * password and signs the member out once the account is gone.
 */
export function DeleteAccount() {
  const t = useTranslations("account.delete");
  const errorMessage = useErrorMessage();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const remove = useMutation({
    mutationFn: () => api.account.delete(password),
    onSuccess: async () => {
      haptic([10, 30, 10]);
      toast.success(t("done"));
      setOpen(false);
      await logout();
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        block
        className="text-danger-ink"
        onClick={() => {
          setPassword("");
          remove.reset();
          setOpen(true);
        }}
      >
        <Trash2 /> {t("open")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        footer={
          <Button
            variant="danger"
            block
            size="lg"
            disabled={password.length === 0 || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? t("deleting") : t("confirm")}
          </Button>
        }
      >
        <div className="space-y-4">
          <ul className="list-disc space-y-2 pl-5 text-small text-muted-foreground">
            <li>{t("bookings")}</li>
            <li>{t("data")}</li>
            <li>{t("history")}</li>
            <li>{t("again")}</li>
          </ul>
          <Field
            label={t("password")}
            htmlFor="delete-account-password"
            error={remove.isError ? errorMessage(remove.error) : undefined}
          >
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
