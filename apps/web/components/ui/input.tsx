import * as React from "react";

import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full rounded-md border border-input bg-surface-2 px-4 text-body text-foreground placeholder:text-muted-foreground transition-tokens outline-none focus-visible:border-transparent focus-visible:ring-[3px] focus-visible:ring-ring aria-invalid:border-danger aria-invalid:ring-danger/30 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldClass, "h-12", className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldClass, "min-h-24 py-3", className)} {...props} />;
  },
);

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-small font-medium text-foreground", className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-small text-danger-ink">
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <p className="text-small text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
