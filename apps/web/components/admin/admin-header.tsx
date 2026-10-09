import type { ReactNode } from "react";

/** Title block for admin pages (the admin shell owns the sticky navigation). */
export function AdminHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 pt-5 pb-1 md:pt-8">
      <div className="min-w-0">
        <h1 className="font-display text-headline font-semibold md:text-display">{title}</h1>
        {subtitle ? <p className="text-small text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
