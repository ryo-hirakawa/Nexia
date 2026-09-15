"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Ingredient, MenuItem } from "@/lib/recipe-server";
import { saveIngredients, saveMenuItems, saveRecipeLines } from "@/app/(app)/recipes/actions";

const yen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
const UNIT_OPTIONS = ["g", "kg", "ml", "L", "個", "本", "枚", "人前"];

type IngRow = { id?: string; name: string; unit: string };
type MenuRow = { id?: string; name: string };

export default function RecipeManager({
  storeId,
  storeName,
  ingredients,
  menuItems,
}: {
  storeId: string;
  storeName: string;
  ingredients: Ingredient[];
  menuItems: MenuItem[];
}) {
  const router = useRouter();

  const [ingRows, setIngRows] = useState<IngRow[]>(
    ingredients.length ? ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit })) : [{ name: "", unit: "g" }],
  );
  const [ingSaving, setIngSaving] = useState(false);
  const [ingMsg, setIngMsg] = useState<string | null>(null);

  const [menuRows, setMenuRows] = useState<MenuRow[]>(menuItems.map((m) => ({ id: m.id, name: m.name })));
  const [newMenuName, setNewMenuName] = useState("");
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuMsg, setMenuMsg] = useState<string | null>(null);

  const inputCls =
    "rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-navy dark:bg-surface";

  async function saveIngredientRows() {
    setIngSaving(true);
    setIngMsg(null);
    try {
      const res = await saveIngredients(storeId, ingRows);
      if (!res.ok) {
        setIngMsg("エラー: " + res.error);
        return;
      }
      setIngMsg("保存しました");
      router.refresh();
    } finally {
      setIngSaving(false);
    }
  }

  async function saveMenuRows() {
    setMenuSaving(true);
    setMenuMsg(null);
    try {
      const rows = newMenuName.trim() ? [...menuRows, { name: newMenuName.trim() }] : menuRows;
      const res = await saveMenuItems(storeId, rows);
      if (!res.ok) {
        setMenuMsg("エラー: " + res.error);
        return;
      }
      setNewMenuName("");
      setMenuMsg("保存しました");
      router.refresh();
    } finally {
      setMenuSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">レシピ原価</h1>
        <p className="text-sm text-muted">{storeName}</p>
        <p className="mt-1 text-xs text-muted">
          メニュー1品ごとの「レシピ原価」を管理します。食材の単価は、日次入力の仕入れで数量を入れると自動更新されます（入れなければ最後に登録した単価のまま）。日々の販売数と掛け合わせた自動集計は連携準備中です。
        </p>
      </div>

      {/* 食材マスタ */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">食材マスタ</h2>
        <div className="space-y-2">
          {ingRows.map((r, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <input
                placeholder="食材名（例：キャベツ）"
                value={r.name}
                onChange={(e) => {
                  const v = [...ingRows];
                  v[idx] = { ...r, name: e.target.value };
                  setIngRows(v);
                }}
                className={inputCls + " w-48"}
              />
              <select
                value={r.unit}
                onChange={(e) => {
                  const v = [...ingRows];
                  v[idx] = { ...r, unit: e.target.value };
                  setIngRows(v);
                }}
                className={inputCls}
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {(() => {
                const orig = ingredients.find((i) => i.id === r.id);
                return orig ? (
                  <span className="text-xs text-muted">現在単価は下のメニュー別原価に反映済み</span>
                ) : null;
              })()}
              <button
                type="button"
                onClick={() => setIngRows(ingRows.filter((_, i) => i !== idx))}
                className="ml-auto text-sm text-muted hover:text-bad"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIngRows([...ingRows, { name: "", unit: "g" }])}
          className="mt-2 rounded-md border border-line px-3 py-1 text-sm"
        >
          ＋ 食材を追加
        </button>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={ingSaving}
            onClick={saveIngredientRows}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-50"
          >
            {ingSaving ? "保存中…" : "食材マスタを保存"}
          </button>
          {ingMsg ? <span className="text-xs text-muted">{ingMsg}</span> : null}
        </div>
      </section>

      {/* メニュー一覧 + レシピ */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">メニュー・レシピ</h2>

        <div className="space-y-2">
          {menuRows.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={r.name}
                onChange={(e) => {
                  const v = [...menuRows];
                  v[idx] = { ...r, name: e.target.value };
                  setMenuRows(v);
                }}
                className={inputCls + " w-56"}
              />
              <button
                type="button"
                onClick={() => setMenuRows(menuRows.filter((_, i) => i !== idx))}
                className="text-sm text-muted hover:text-bad"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            placeholder="メニューを追加（例：鉄板焼き定食）"
            value={newMenuName}
            onChange={(e) => setNewMenuName(e.target.value)}
            className={inputCls + " w-56"}
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={menuSaving}
            onClick={saveMenuRows}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-50"
          >
            {menuSaving ? "保存中…" : "メニュー一覧を保存"}
          </button>
          {menuMsg ? <span className="text-xs text-muted">{menuMsg}</span> : null}
        </div>

        {menuItems.length > 0 ? (
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            {menuItems.map((m) => (
              <RecipeEditor key={m.id} menuItem={m} ingredients={ingredients} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">
            メニューを追加して保存すると、ここに1品ずつレシピ(食材と分量)を登録できるようになります。
          </p>
        )}
      </section>
    </div>
  );
}

function RecipeEditor({ menuItem, ingredients }: { menuItem: MenuItem; ingredients: Ingredient[] }) {
  const router = useRouter();
  type LineRow = { id?: string; ingredientId: string; quantity: string };
  const [lines, setLines] = useState<LineRow[]>(
    menuItem.lines.map((l) => ({ id: l.id, ingredientId: l.ingredientId, quantity: String(l.quantity) })),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const inputCls =
    "rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-navy dark:bg-surface";

  const cost = lines.reduce((s, l) => {
    const ing = ingredients.find((i) => i.id === l.ingredientId);
    const price = menuItem.lines.find((ml) => ml.ingredientId === l.ingredientId)?.unitPrice ?? 0;
    return s + (ing ? Number(l.quantity || 0) * price : 0);
  }, 0);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const payload = lines
        .filter((l) => l.ingredientId && Number(l.quantity) > 0)
        .map((l) => ({ id: l.id, ingredientId: l.ingredientId, quantity: Number(l.quantity) }));
      const res = await saveRecipeLines(menuItem.id, payload);
      if (!res.ok) {
        setMsg("エラー: " + res.error);
        return;
      }
      setMsg("保存しました");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-lg border border-line p-3">
      <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
        <span>{menuItem.name}</span>
        <span className="font-mono text-xs tabular-nums text-muted">レシピ原価 {yen(menuItem.costPerServing)}</span>
      </summary>
      <div className="mt-3 space-y-2">
        {lines.map((l, idx) => {
          const ing = ingredients.find((i) => i.id === l.ingredientId);
          return (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <select
                value={l.ingredientId}
                onChange={(e) => {
                  const v = [...lines];
                  v[idx] = { ...l, ingredientId: e.target.value };
                  setLines(v);
                }}
                className={inputCls}
              >
                <option value="">食材を選択</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                inputMode="decimal"
                placeholder="分量"
                value={l.quantity}
                onChange={(e) => {
                  const v = [...lines];
                  v[idx] = { ...l, quantity: e.target.value };
                  setLines(v);
                }}
                className={inputCls + " w-20 text-right"}
              />
              <span className="text-xs text-muted">{ing?.unit ?? ""}</span>
              <button
                type="button"
                onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                className="ml-auto text-sm text-muted hover:text-bad"
              >
                削除
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setLines([...lines, { ingredientId: "", quantity: "" }])}
          className="rounded-md border border-line px-3 py-1 text-sm"
        >
          ＋ 食材を追加
        </button>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-50"
          >
            {saving ? "保存中…" : "レシピを保存"}
          </button>
          <span className="font-mono text-xs tabular-nums text-muted">現在の原価: {yen(cost)}</span>
          {msg ? <span className="text-xs text-muted">{msg}</span> : null}
        </div>
        {menuItem.lines.some((l) => l.priceAsOf) ? (
          <p className="text-[10px] text-muted">
            単価の基準日:{" "}
            {menuItem.lines
              .filter((l) => l.priceAsOf)
              .map((l) => `${l.ingredientName}(${l.priceAsOf})`)
              .join(" / ")}
          </p>
        ) : null}
      </div>
    </details>
  );
}
