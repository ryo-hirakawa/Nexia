import { createClient } from "@/lib/supabase/server";

export type Ingredient = { id: string; name: string; unit: string };

export type RecipeLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  unitPrice: number; // 直近の有効単価（無ければ0）
  priceAsOf: string | null;
};

export type MenuItem = {
  id: string;
  name: string;
  lines: RecipeLine[];
  costPerServing: number;
};

export async function loadIngredients(storeId: string): Promise<Ingredient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ingredients")
    .select("id, name, unit, sort_order")
    .eq("store_id", storeId)
    .order("sort_order");
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, unit: r.unit }));
}

/** 食材ごとの「直近の単価」（対象日を指定しなければ今日時点で一番新しいもの）。 */
export async function loadLatestIngredientPrices(
  storeId: string,
): Promise<Map<string, { price: number; asOf: string }>> {
  const supabase = await createClient();
  const { data: ingredientRows } = await supabase
    .from("ingredients")
    .select("id")
    .eq("store_id", storeId);
  const ids = (ingredientRows ?? []).map((r) => r.id);
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from("ingredient_prices")
    .select("ingredient_id, business_date, unit_price")
    .in("ingredient_id", ids)
    .order("business_date", { ascending: false });

  const map = new Map<string, { price: number; asOf: string }>();
  for (const r of data ?? []) {
    if (!map.has(r.ingredient_id)) {
      map.set(r.ingredient_id, { price: Number(r.unit_price), asOf: r.business_date });
    }
  }
  return map;
}

export async function loadMenuItems(storeId: string): Promise<MenuItem[]> {
  const supabase = await createClient();

  const [{ data: menuRows }, prices] = await Promise.all([
    supabase
      .from("menu_items")
      .select(
        "id, name, sort_order, recipe_lines(id, ingredient_id, quantity, sort_order, ingredients(id, name, unit))",
      )
      .eq("store_id", storeId)
      .order("sort_order"),
    loadLatestIngredientPrices(storeId),
  ]);

  type RawLine = {
    id: string;
    ingredient_id: string;
    quantity: number;
    sort_order: number;
    ingredients: { id: string; name: string; unit: string } | { id: string; name: string; unit: string }[] | null;
  };

  return (menuRows ?? []).map((m) => {
    const rawLines = ((m.recipe_lines ?? []) as RawLine[]).slice().sort((a, b) => a.sort_order - b.sort_order);
    const lines: RecipeLine[] = rawLines.map((l) => {
      const ing = Array.isArray(l.ingredients) ? l.ingredients[0] : l.ingredients;
      const priceInfo = ing ? prices.get(ing.id) : undefined;
      const unitPrice = priceInfo?.price ?? 0;
      return {
        id: l.id,
        ingredientId: l.ingredient_id,
        ingredientName: ing?.name ?? "(削除済み)",
        unit: ing?.unit ?? "",
        quantity: Number(l.quantity),
        unitPrice,
        priceAsOf: priceInfo?.asOf ?? null,
      };
    });
    const costPerServing = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    return { id: m.id, name: m.name, lines, costPerServing };
  });
}
