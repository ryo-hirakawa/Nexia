"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { yen } from "@/lib/daily";
import { daysInMonth, monthLabel } from "@/lib/finance";
import { FIXED_CATEGORIES, type MonthlySetupForm } from "@/lib/monthly";
import {
  saveMonthlySetup,
  saveVariableItems,
} from "@/app/(app)/setup/actions";

const num = (s: string) => {
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const str = (n: number) => (n ? String(n) : "");

type FixedRow = { item: string; category: string; amount: string };
type StaffRow = { name: string; amount: string };

export default function MonthlySetup({
  storeName,
  initial,
  prev,
  variableItems,
  nextMonth,
  prevMonth,
}: {
  storeName: string;
  initial: MonthlySetupForm;
  prev: MonthlySetupForm;
  variableItems: string[];
  prevMonthKey: string;
  nextMonth: string;
  prevMonth: string;
}) {
  const router = useRouter();
  const dim = daysInMonth(initial.yearMonth);

  const [fixed, setFixed] = useState<FixedRow[]>(() =>
    initial.fixed.length
      ? initial.fixed.map((l) => ({
          item: l.item,
          category: l.category,
          amount: str(l.amount),
        }))
      : [{ item: "", category: FIXED_CATEGORIES[0], amount: "" }],
  );
  const [staff, setStaff] = useState<StaffRow[]>(() =>
    initial.staff.length
      ? initial.staff.map((l) => ({ name: l.name, amount: str(l.amount) }))
      : [{ name: "", amount: "" }],
  );
  const [vitems, setVitems] = useState<string[]>(variableItems);
  const [newItem, setNewItem] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const perDay = (monthly: number) => (dim > 0 ? Math.round(monthly / dim) : 0);

  const fixedMonthly = fixed.reduce((s, r) => s + num(r.amount), 0);
  const fixedDaily = fixed.reduce((s, r) => s + perDay(num(r.amount)), 0);
  const staffMonthly = staff.reduce((s, r) => s + num(r.amount), 0);
  const staffDaily = staff.reduce((s, r) => s + perDay(num(r.amount)), 0);

  const canCopyPrev = prev.id !== null;

  function copyFromPrev() {
    if (!canCopyPrev) return;
    setFixed(
      prev.fixed.length
        ? prev.fixed.map((l) => ({
            item: l.item,
            category: l.category,
            amount: str(l.amount),
          }))
        : [{ item: "", category: FIXED_CATEGORIES[0], amount: "" }],
    );
    setStaff(
      prev.staff.length
        ? prev.staff.map((l) => ({ name: l.name, amount: str(l.amount) }))
        : [{ name: "", amount: "" }],
    );
    setSavedMsg("前月の設定をコピーしました（保存するまで反映されません）");
  }

  async function save() {
    setError(null);
    setSavedMsg(null);
    setSaving(true);
    try {
      const r1 = await saveMonthlySetup({
        storeId: initial.storeId,
        yearMonth: initial.yearMonth,
        fixed: fixed.map((r) => ({
          item: r.item,
          category: r.category,
          amount: num(r.amount),
        })),
        staff: staff.map((r) => ({ name: r.name, amount: num(r.amount) })),
      });
      if (!r1.ok) {
        setError(r1.error);
        return;
      }
      const r2 = await saveVariableItems(initial.storeId, vitems);
      if (!r2.ok) {
        setError(r2.error);
        return;
      }
      setSavedMsg("保存しました");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";
  const amtCls = inputCls + " w-32 text-right tabular-nums";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">月初セットアップ</h1>
          <p className="text-sm text-zinc-500">{storeName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <a
            href={`/setup/${initial.storeId}/${prevMonth}`}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            ◀ 前月
          </a>
          <span className="font-medium">
            {monthLabel(initial.yearMonth)}（実日数 {dim}）
          </span>
          <a
            href={`/setup/${initial.storeId}/${nextMonth}`}
            className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            翌月 ▶
          </a>
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!canCopyPrev || saving}
          onClick={copyFromPrev}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          前月（{prevMonth}）からコピー
        </button>
        {!canCopyPrev ? (
          <span className="text-xs text-zinc-400">前月の設定はまだありません</span>
        ) : null}
      </div>

      {/* 固定費 */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold">固定費</h2>
        <p className="mb-3 text-xs text-zinc-400">
          家賃・リース・保険・通信・借入返済・減価償却 など。月給スタッフは含めない。
        </p>
        <datalist id="fixed-cats">
          {FIXED_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="space-y-2">
          {fixed.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                placeholder="費目（例：店舗家賃）"
                value={r.item}
                onChange={(e) => {
                  const v = [...fixed];
                  v[i] = { ...r, item: e.target.value };
                  setFixed(v);
                }}
                className={inputCls + " w-44"}
              />
              <input
                list="fixed-cats"
                placeholder="分類"
                value={r.category}
                onChange={(e) => {
                  const v = [...fixed];
                  v[i] = { ...r, category: e.target.value };
                  setFixed(v);
                }}
                className={inputCls + " w-36"}
              />
              <input
                inputMode="numeric"
                placeholder="月額"
                value={r.amount}
                onChange={(e) => {
                  const v = [...fixed];
                  v[i] = { ...r, amount: e.target.value };
                  setFixed(v);
                }}
                className={amtCls}
              />
              <span className="w-28 text-right font-mono text-xs tabular-nums text-zinc-400">
                {yen(perDay(num(r.amount)))} / 日
              </span>
              <button
                type="button"
                onClick={() => setFixed(fixed.filter((_, j) => j !== i))}
                className="text-sm text-zinc-400 hover:text-red-600"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setFixed([
              ...fixed,
              { item: "", category: FIXED_CATEGORIES[0], amount: "" },
            ])
          }
          className="mt-2 rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
        >
          ＋ 固定費を追加
        </button>
        <p className="mt-3 text-sm text-zinc-500">
          合計　月額 <span className="font-mono tabular-nums">{yen(fixedMonthly)}</span>
          　・　日割り{" "}
          <span className="font-mono tabular-nums">{yen(fixedDaily)} / 日</span>
        </p>
      </section>

      {/* 月給スタッフ */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold">月給スタッフ</h2>
        <p className="mb-3 text-xs text-zinc-400">
          月額は会社負担の総額（社保・交通費込み）。ダッシュボードでは
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            {" "}
            人件費{" "}
          </span>
          に集計され、固定費には入りません。
        </p>
        <div className="space-y-2">
          {staff.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                placeholder="スタッフ名"
                value={r.name}
                onChange={(e) => {
                  const v = [...staff];
                  v[i] = { ...r, name: e.target.value };
                  setStaff(v);
                }}
                className={inputCls + " w-44"}
              />
              <input
                inputMode="numeric"
                placeholder="月額"
                value={r.amount}
                onChange={(e) => {
                  const v = [...staff];
                  v[i] = { ...r, amount: e.target.value };
                  setStaff(v);
                }}
                className={amtCls}
              />
              <span className="w-28 text-right font-mono text-xs tabular-nums text-zinc-400">
                {yen(perDay(num(r.amount)))} / 日
              </span>
              <button
                type="button"
                onClick={() => setStaff(staff.filter((_, j) => j !== i))}
                className="text-sm text-zinc-400 hover:text-red-600"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setStaff([...staff, { name: "", amount: "" }])}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
        >
          ＋ スタッフを追加
        </button>
        <p className="mt-3 text-sm text-zinc-500">
          合計　月額 <span className="font-mono tabular-nums">{yen(staffMonthly)}</span>
          　・　日割り{" "}
          <span className="font-mono tabular-nums">{yen(staffDaily)} / 日</span>
          （人件費へ）
        </p>
      </section>

      {/* 流動費の費目リスト */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-sm font-semibold">流動費の費目リスト</h2>
        <p className="mb-3 text-xs text-zinc-400">
          日次入力の「流動費」で選べる費目。店舗共通（月ごとの設定ではありません）。
        </p>
        <div className="flex flex-wrap gap-2">
          {vitems.map((it) => (
            <span
              key={it}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
            >
              {it}
              <button
                type="button"
                onClick={() => setVitems(vitems.filter((x) => x !== it))}
                className="text-zinc-400 hover:text-red-600"
                aria-label={`${it} を削除`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            placeholder="費目を追加"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = newItem.trim();
                if (v && !vitems.includes(v)) setVitems([...vitems, v]);
                setNewItem("");
              }
            }}
            className={inputCls + " w-48"}
          />
          <button
            type="button"
            onClick={() => {
              const v = newItem.trim();
              if (v && !vitems.includes(v)) setVitems([...vitems, v]);
              setNewItem("");
            }}
            className="rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
          >
            ＋ 追加
          </button>
        </div>
      </section>

      <div className="pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <p className="mt-2 text-xs text-zinc-400">
          金額を月中に変えて保存すると、その月の全日の日割りが計算し直されます。
        </p>
      </div>
    </div>
  );
}
