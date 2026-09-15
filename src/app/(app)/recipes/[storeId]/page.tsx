import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { loadIngredients, loadMenuItems } from "@/lib/recipe-server";
import RecipeManager from "./RecipeManager";

export default async function RecipesPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  await requireMembership();
  const { storeId } = await params;

  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("id, name").eq("id", storeId).maybeSingle();
  if (!store) notFound();

  const [ingredients, menuItems] = await Promise.all([
    loadIngredients(storeId),
    loadMenuItems(storeId),
  ]);

  return <RecipeManager storeId={storeId} storeName={store.name} ingredients={ingredients} menuItems={menuItems} />;
}
