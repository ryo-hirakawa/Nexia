import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientRole, Membership, Profile } from "@/lib/types";

/**
 * ログイン中ユーザーと、その権限（管理者か / どの会社で何の役割か）を取得する。
 * 未ログインなら /login へ。
 *
 * すべて RLS 前提のクエリ: profiles は自分の行、client_members は自分の行しか返らない。
 */
export async function requireMembership(): Promise<Membership> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, full_name, is_platform_admin, created_at")
    .eq("id", user.id)
    .single();

  const profile: Profile = profileRow ?? {
    id: user.id,
    full_name: (user.user_metadata?.full_name as string) ?? null,
    is_platform_admin: false,
    created_at: new Date().toISOString(),
  };

  const { data: memberRows } = await supabase
    .from("client_members")
    .select("client_id, role");

  return {
    profile,
    isPlatformAdmin: profile.is_platform_admin,
    clientRoles: (memberRows ?? []) as { client_id: string; role: ClientRole }[],
  };
}

export function hasRole(m: Membership, role: ClientRole): boolean {
  return m.clientRoles.some((r) => r.role === role);
}

/** 画面に出す役割の見出し（管理者 > 経営者 > 店舗責任者 の優先順） */
export function primaryRoleLabel(m: Membership): string {
  if (m.isPlatformAdmin) return "管理者（コンサル）";
  if (hasRole(m, "owner")) return "経営者";
  if (hasRole(m, "manager")) return "店舗責任者";
  return "未割り当て";
}
