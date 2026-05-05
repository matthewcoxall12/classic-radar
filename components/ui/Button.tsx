import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const styles = {
  primary: "bg-racing text-paper hover:bg-racing/90",
  secondary: "border border-ink/15 bg-paper text-ink hover:border-racing/40 hover:bg-cream",
  ghost: "text-ink hover:bg-cream",
  danger: "bg-oxblood text-paper hover:bg-oxblood/90"
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn("focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition", styles[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  className,
  variant = "primary",
  children,
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonProps["variant"]; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition", styles[variant], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
