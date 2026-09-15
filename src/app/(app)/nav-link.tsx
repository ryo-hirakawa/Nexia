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
    // prefetch を付けない: 付けると店舗選択などCookie依存のページも先読み・
    // キャッシュされ、Cookieを書き換えた直後にクリックしても古い内容が
    // 表示されてしまう(店舗を切り替えても遷移先が前の店舗のまま、という
    // 不具合の原因だった)。
    <Link
      href={href}
      className={
        "transition-colors " +
        (active ? "text-white" : "text-white/75 hover:text-white")
      }
    >
      <Label label={label} />
    </Link>
  );
}
