import Link from "next/link";
import { requireMembership, primaryRoleLabel, hasRole } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { APP_NAME, APP_SUFFIX } from "@/lib/brand";
import { NavLink } from "./nav-link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const membership = await requireMembership();
  const roleLabel = primaryRoleLabel(membership);

  const canWrite =
    membership.isPlatformAdmin ||
    hasRole(membership, "owner") ||
    hasRole(membership, "manager");

  const nav: { href: string; label: string }[] = [
    { href: "/dashboard", label: "ダッシュボード" },
  ];
  if (canWrite) {
    nav.push({ href: "/input", label: "日次入力" });
    nav.push({ href: "/setup", label: "月初セットアップ" });
    nav.push({ href: "/stores", label: "店舗" });
  }
  nav.push({ href: "/help", label: "使い方" });
  nav.push({ href: "/settings", label: "設定" });
  if (membership.isPlatformAdmin) {
    nav.push({ href: "/admin/clients", label: "クライアント管理" });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="flex items-baseline gap-1.5">
            <span className="text-base font-bold tracking-tight">{APP_NAME}</span>
            <span className="text-[10px] font-medium text-white/55">{APP_SUFFIX}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {nav.map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90">
              {roleLabel}
            </span>
            <span className="hidden text-xs text-white/55 sm:inline">
              {membership.profile.full_name ?? ""}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-white/25 px-2.5 py-1 text-xs text-white/85 hover:bg-white/10"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
