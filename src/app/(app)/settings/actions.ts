"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";

type Result = { ok: true; message: string } | { ok: false; error: string };

export async function updateProfileName(name: string): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "セッションが切れています。再ログインしてください" };

  const trimmed = name.trim().slice(0, 60);
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: trimmed || null })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, message: "表示名を更新しました" };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, error: "セッションが切れています。再ログインしてください" };
  }

  if (newPassword.length < 8) {
    return { ok: false, error: "新しいパスワードは8文字以上にしてください" };
  }

  // 現在のパスワードを検証（セッションに触れない一時クライアントで）
  const verifier = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: verifyErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyErr) {
    return { ok: false, error: "現在のパスワードが違います" };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: "パスワードを変更しました" };
}
