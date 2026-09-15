"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";

type Result = { ok: true } | { ok: false; error: string };

/**
 * id付きの行は更新、id無しは新規、既存にあって送られてこなかったものは削除。
 * (食材・メニューは recipe_lines / ingredient_prices から参照されるため、
 * 売上カテゴリ等のような「全削除して入れ直す」方式は使えない。)
 */
export async function saveIngredients(
  storeId: string,
  rows: { id?: string; name: string; unit: string }[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = rows
    .map((r) => ({ id: r.id, name: r.name.trim(), unit: r.unit.trim() || "g" }))
    .filter((r) => r.name !== "")
    .slice(0, 300);

  const { data: existing } = await supabase.from("ingredients").select("id").eq("store_id", storeId);
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keepIds = new Set(clean.filter((r) => r.id).map((r) => r.id as string));
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

  if (toDelete.length) {
    const { error } = await supabase.from("ingredients").delete().in("id", toDelete);
    if (error) return { ok: false, error: error.message };
  }

  for (let i = 0; i < clean.length; i++) {
    const r = clean[i];
    if (r.id) {
      const { error } = await supabase
        .from("ingredients")
        .update({ name: r.name, unit: r.unit, sort_order: i })
        .eq("id", r.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("ingredients")
        .insert({ store_id: storeId, name: r.name, unit: r.unit, sort_order: i });
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/recipes/${storeId}`);
  revalidatePath("/input");
  return { ok: true };
}

export async function saveMenuItems(
  storeId: string,
  rows: { id?: string; name: string }[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = rows
    .map((r) => ({ id: r.id, name: r.name.trim() }))
    .filter((r) => r.name !== "")
    .slice(0, 300);

  const { data: existing } = await supabase.from("menu_items").select("id").eq("store_id", storeId);
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keepIds = new Set(clean.filter((r) => r.id).map((r) => r.id as string));
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

  if (toDelete.length) {
    const { error } = await supabase.from("menu_items").delete().in("id", toDelete);
    if (error) return { ok: false, error: error.message };
  }

  for (let i = 0; i < clean.length; i++) {
    const r = clean[i];
    if (r.id) {
      const { error } = await supabase.from("menu_items").update({ name: r.name, sort_order: i }).eq("id", r.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("menu_items").insert({ store_id: storeId, name: r.name, sort_order: i });
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/recipes/${storeId}`);
  return { ok: true };
}

export async function saveRecipeLines(
  menuItemId: string,
  lines: { id?: string; ingredientId: string; quantity: number }[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = lines
    .map((l) => ({ id: l.id, ingredientId: l.ingredientId, quantity: Math.max(0, Number(l.quantity) || 0) }))
    .filter((l) => l.ingredientId && l.quantity > 0)
    .slice(0, 100);

  const { data: existing } = await supabase.from("recipe_lines").select("id").eq("menu_item_id", menuItemId);
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keepIds = new Set(clean.filter((l) => l.id).map((l) => l.id as string));
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

  if (toDelete.length) {
    const { error } = await supabase.from("recipe_lines").delete().in("id", toDelete);
    if (error) return { ok: false, error: error.message };
  }

  for (let i = 0; i < clean.length; i++) {
    const l = clean[i];
    if (l.id) {
      const { error } = await supabase
        .from("recipe_lines")
        .update({ ingredient_id: l.ingredientId, quantity: l.quantity, sort_order: i })
        .eq("id", l.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("recipe_lines")
        .insert({ menu_item_id: menuItemId, ingredient_id: l.ingredientId, quantity: l.quantity, sort_order: i });
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/recipes`);
  return { ok: true };
}
