"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLMotionProps, motion } from "motion/react";
import Link from "next/link";
import * as React from "react";

import { spring, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Every size keeps the touch target at 44px or more. */
const buttonVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-tokens outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-glow hover:brightness-105",
        secondary: "border border-border bg-surface-2 text-foreground hover:bg-surface-3",
        outline: "border border-border-strong bg-transparent text-foreground hover:bg-surface-2",
        ghost: "bg-transparent text-foreground hover:bg-surface-2",
        danger: "bg-danger text-on-color hover:brightness-105",
        dangerSoft: "bg-danger-soft text-danger-ink hover:brightness-110",
        link: "h-auto rounded-md px-0 text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-11 px-4 text-small",
        md: "h-12 px-5 text-body",
        lg: "h-14 px-6 text-body",
        icon: "size-11",
        iconLg: "size-14",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> &
  ButtonVariantProps & { children?: React.ReactNode; loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={tap}
      transition={spring.snappy}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    >
      {loading ? <span aria-hidden className="absolute inset-0 m-auto size-5 animate-ball-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>{children}</span>
    </motion.button>
  );
});

const MotionLink = motion.create(Link);

export type ButtonLinkProps = React.ComponentProps<typeof MotionLink> & ButtonVariantProps;

export function ButtonLink({ className, variant, size, block, ...props }: ButtonLinkProps) {
  return (
    <MotionLink
      whileTap={tap}
      transition={spring.snappy}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
