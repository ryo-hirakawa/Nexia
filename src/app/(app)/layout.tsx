import Link from "next/link";
import { requireMembership, primaryRoleLabel, hasRole } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

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
    nav.push({ href: "/stores", label: "店舗" });
  }
  if (membership.isPlatformAdmin) {
    nav.push({ href: "/admin/clients", label: "クライアント管理" });
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
          <span className="text-sm font-semibold">店舗売上管理ツール</span>
          <nav className="flex items-center gap-3 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {roleLabel}
            </span>
            <span className="hidden text-xs text-zinc-400 sm:inline">
              {membership.profile.full_name ?? ""}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
