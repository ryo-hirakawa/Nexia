"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SALES_CATEGORIES,
  VARIABLE_COST_ITEMS,
  PAYMENT_METHODS,
  WEATHER_OPTIONS,
  COGS_ITEMS,
  LABOR_ITEMS,
  type PaymentKey,
} from "@/lib/bar-preset";
import { yen, type DailyRecordForm } from "@/lib/daily";
import { saveDailyRecord, type SavePayload } from "@/app/(app)/input/actions";

const num = (s: string) => {
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const str = (n: number) => (n ? String(n) : "");

type VarRow = { item: string; amount: string; note: string };

export default function DailyForm({
  initial,
  storeName,
  prevDate,
  nextDate,
}: {
  initial: DailyRecordForm;
  storeName: string;
  prevDate: string;
  nextDate: string;
}) {
  const router = useRouter();

  const [weather, setWeather] = useState(initial.weather ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [totalSales, setTotalSales] = useState(str(initial.totalSales));
  const [guestCount, setGuestCount] = useState(str(initial.guestCount));
  const [groupCount, setGroupCount] = useState(str(initial.groupCount));

  const [cat, setCat] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of SALES_CATEGORIES) m[c] = "";
    for (const l of initial.categories) m[l.category] = str(l.amount);
    return m;
  });

  const [pay, setPay] = useState<Record<PaymentKey, string>>(() => {
    const m = {} as Record<PaymentKey, string>;
    for (const p of PAYMENT_METHODS) m[p.key] = str(initial.payments[p.key] ?? 0);
    return m;
  });

  const costOf = (cls: string, item: string) =>
    str(initial.costs.find((c) => c.cost_class === cls && c.item === item)?.amount ?? 0);

  const [cogs, setCogs] = useState<Record<string, string>>(() =>
    Object.fromEntries(COGS_ITEMS.map((i) => [i, costOf("cogs", i)])),
  );
  const [labor, setLabor] = useState<Record<string, string>>(() =>
    Object.fromEntries(LABOR_ITEMS.map((i) => [i, costOf("labor", i)])),
  );
  const [vars, setVars] = useState<VarRow[]>(() => {
    const rows = initial.costs
      .filter((c) => c.cost_class === "variable")
      .map((c) => ({ item: c.item, amount: str(c.amount), note: c.note ?? "" }));
    return rows.length ? rows : [{ item: VARIABLE_COST_ITEMS[0], amount: "", note: "" }];
  });

  const [status, setStatus] = useState(initial.status);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "confirm">(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const totalNum = num(totalSales);
  const catSum = useMemo(
    () => SALES_CATEGORIES.reduce((s, c) => s + num(cat[c]), 0),
    [cat],
  );
  const paySum = useMemo(
    () => PAYMENT_METHODS.reduce((s, p) => s + num(pay[p.key]), 0),
    [pay],
  );
  const varSum = useMemo(
    () => vars.reduce((s, r) => s + num(r.amount), 0),
    [vars],
  );
  const guestNum = num(guestCount);
  const groupNum = num(groupCount);

  const catMismatch =
    (catSum > 0 || totalNum > 0) && catSum > 0 && catSum !== totalNum;
  const payMismatch =
    (paySum > 0 || totalNum > 0) && paySum > 0 && paySum !== totalNum;

  function buildPayload(confirm: boolean): SavePayload {
    const costs: SavePayload["costs"] = [];
    for (const i of COGS_ITEMS)
      if (num(cogs[i])) costs.push({ cost_class: "cogs", item: i, amount: num(cogs[i]) });
    for (const i of LABOR_ITEMS)
      if (num(labor[i])) costs.push({ cost_class: "labor", item: i, amount: num(labor[i]) });
    for (const r of vars)
      if (num(r.amount) && r.item.trim())
        costs.push({
          cost_class: "variable",
          item: r.item.trim(),
          amount: num(r.amount),
          note: r.note.trim() || null,
        });

    return {
      storeId: initial.storeId,
      businessDate: initial.businessDate,
      weather: weather || null,
      note: note || null,
      totalSales: totalNum,
      guestCount: guestNum,
      groupCount: groupNum,
      categories: SALES_CATEGORIES.map((c) => ({ category: c, amount: num(cat[c]) })),
      payments: PAYMENT_METHODS.map((p) => ({ method: p.key, amount: num(pay[p.key]) })),
      costs,
      confirm,
    };
  }

  async function submit(confirm: boolean) {
    setError(null);
    setSavedMsg(null);
    setSaving(confirm ? "confirm" : "draft");
    try {
      const res = await saveDailyRecord(buildPayload(confirm));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStatus(res.status);
      setSavedMsg(res.status === "confirmed" ? "確定しました" : "下書きを保存しました");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  const inputCls =
    "w-28 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";
  const wideCls = inputCls.replace("w-28", "w-40");

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">日次入力</h1>
          <p className="text-sm text-zinc-500">{storeName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <a href={`/input/${initial.storeId}/${prevDate}`} className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700">
            ◀ 前日
          </a>
          <span className="font-mono font-medium tabular-nums">{initial.businessDate}</span>
          <a href={`/input/${initial.storeId}/${nextDate}`} className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700">
            翌日 ▶
          </a>
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs " +
              (status === "confirmed"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800")
            }
          >
            {status === "confirmed" ? "確定済み" : "下書き"}
          </span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {savedMsg ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          {savedMsg}
        </p>
      ) : null}

      {/* 基本 */}
      <Section title="基本">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">天候</span>
          {WEATHER_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeather(weather === w ? "" : w)}
              className={
                "rounded-full border px-3 py-1 text-sm " +
                (weather === w
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700")
              }
            >
              {w}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-zinc-500">特記メモ（貸切・イベント等）</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
          />
        </label>
      </Section>

      {/* 売上・客数 */}
      <Section title="売上・客数">
        <Row label="総売上">
          <input inputMode="numeric" value={totalSales} onChange={(e) => setTotalSales(e.target.value)} className={inputCls} />
        </Row>
        <Row label="客数">
          <input inputMode="numeric" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} className={inputCls} />
        </Row>
        <Row label="組数">
          <input inputMode="numeric" value={groupCount} onChange={(e) => setGroupCount(e.target.value)} className={inputCls} />
        </Row>
        <Row label="客単価 / 組単価" muted>
          <span className="font-mono text-sm tabular-nums text-zinc-400">
            {guestNum ? yen(totalNum / guestNum) : "—"} / {groupNum ? yen(totalNum / groupNum) : "—"}
          </span>
        </Row>
      </Section>

      {/* 売上内訳 */}
      <Section title="売上内訳（カテゴリ）">
        {SALES_CATEGORIES.map((c) => (
          <Row key={c} label={c}>
            <input inputMode="numeric" value={cat[c]} onChange={(e) => setCat({ ...cat, [c]: e.target.value })} className={inputCls} />
          </Row>
        ))}
        <Row label="内訳合計" muted>
          <span className={"font-mono text-sm tabular-nums " + (catMismatch ? "text-red-600" : "text-zinc-400")}>
            {yen(catSum)} {catSum === 0 ? "" : catMismatch ? "✕ 総売上と不一致" : "✓ 総売上と一致"}
          </span>
        </Row>
      </Section>

      {/* 決済 */}
      <Section title="決済">
        {PAYMENT_METHODS.map((m) => (
          <Row key={m.key} label={m.label}>
            <input inputMode="numeric" value={pay[m.key]} onChange={(e) => setPay({ ...pay, [m.key]: e.target.value })} className={inputCls} />
          </Row>
        ))}
        <Row label="決済合計" muted>
          <span className={"font-mono text-sm tabular-nums " + (payMismatch ? "text-red-600" : "text-zinc-400")}>
            {yen(paySum)} {paySum === 0 ? "" : payMismatch ? "✕ 総売上と不一致" : "✓ 総売上と一致"}
          </span>
        </Row>
      </Section>

      {/* 仕入れ・人件費 */}
      <Section title="仕入れ・人件費">
        {COGS_ITEMS.map((i) => (
          <Row key={i} label={`仕入 ${i}`}>
            <input inputMode="numeric" value={cogs[i]} onChange={(e) => setCogs({ ...cogs, [i]: e.target.value })} className={inputCls} />
          </Row>
        ))}
        {LABOR_ITEMS.map((i) => (
          <Row key={i} label={`人件費 ${i}`}>
            <input inputMode="numeric" value={labor[i]} onChange={(e) => setLabor({ ...labor, [i]: e.target.value })} className={inputCls} />
          </Row>
        ))}
        <p className="mt-1 text-xs text-zinc-400">
          キャストバック・月給スタッフ（日割り）・固定費は、月初セットアップ（M2′）から自動で人件費・経費に反映されます。
        </p>
      </Section>

      {/* 流動費 */}
      <Section title="流動費（費目別・1件ずつ）">
        <div className="space-y-2">
          {vars.map((r, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <select
                value={r.item}
                onChange={(e) => {
                  const v = [...vars];
                  v[idx] = { ...r, item: e.target.value };
                  setVars(v);
                }}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {VARIABLE_COST_ITEMS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <input
                inputMode="numeric"
                placeholder="金額"
                value={r.amount}
                onChange={(e) => {
                  const v = [...vars];
                  v[idx] = { ...r, amount: e.target.value };
                  setVars(v);
                }}
                className={inputCls}
              />
              <input
                placeholder="メモ（任意）"
                value={r.note}
                onChange={(e) => {
                  const v = [...vars];
                  v[idx] = { ...r, note: e.target.value };
                  setVars(v);
                }}
                className={wideCls + " text-left"}
              />
              <button
                type="button"
                onClick={() => setVars(vars.filter((_, i) => i !== idx))}
                className="text-sm text-zinc-400 hover:text-red-600"
                aria-label="この行を削除"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setVars([...vars, { item: VARIABLE_COST_ITEMS[0], amount: "", note: "" }])}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
        >
          ＋ 明細を追加
        </button>
        <Row label="流動費 合計" muted>
          <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(varSum)}</span>
        </Row>
      </Section>

      {/* actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => submit(false)}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {saving === "draft" ? "保存中…" : "下書き保存"}
        </button>
        <button
          type="button"
          disabled={saving !== null}
          onClick={() => submit(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving === "confirm" ? "送信中…" : "確定して送信"}
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        確定するには「総売上」と、入力済みの「売上内訳」「決済」の合計が一致している必要があります。確定後も修正できます（更新履歴が残ります）。
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className={"text-sm " + (muted ? "text-zinc-400" : "text-zinc-600 dark:text-zinc-300")}>
        {label}
      </span>
      {children}
    </div>
  );
}
