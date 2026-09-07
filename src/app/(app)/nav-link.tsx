"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

function Label({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {pending ? (
        <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
      ) : null}
    </span>
  );
}

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active =
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href + "/")) ||
    (href !== "/dashboard" && pathname === href);

  return (
    <Link
      href={href}
      prefetch
      className={
        "transition-colors " +
        (active ? "text-white" : "text-white/75 hover:text-white")
      }
    >
      <Label label={label} />
    </Link>
  );
}
