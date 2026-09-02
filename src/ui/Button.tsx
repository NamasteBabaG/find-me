import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "sea" | "berry" | "danger";
type Size = "sm" | "md" | "lg" | "kid";

function classes(variant: Variant, size: Size, block: boolean, extra?: string): string {
  return [
    "fm-btn",
    variant !== "primary" ? `fm-btn--${variant}` : "",
    size !== "md" ? `fm-btn--${size}` : "",
    block ? "fm-btn--block" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", block = false, loading = false, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button className={classes(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="fm-spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

export interface LinkButtonProps {
  href: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
  target?: string;
}

export function LinkButton({ href, variant = "primary", size = "md", block = false, className, children, prefetch, target }: LinkButtonProps) {
  return (
    <Link href={href} className={classes(variant, size, block, className)} prefetch={prefetch} target={target}>
      {children}
    </Link>
  );
}
