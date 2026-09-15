"use client";

import Link from "next/link";
import { setLastStoreCookie } from "@/lib/store-cookie";

/** 店舗一覧からのリンク。クリック時に「最後に見た店舗」を Cookie に覚え、
 *  ダッシュボード等に戻ったときも同じ店舗を表示できるようにする。 */
export function StorePickerLink({
  href,
  storeId,
  className,
  children,
}: {
  href: string;
  storeId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => setLastStoreCookie(storeId)}
    >
      {children}
    </Link>
  );
}
