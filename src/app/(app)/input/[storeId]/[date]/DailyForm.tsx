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
type RecvRow = { cp: string; amt: string };
type CastRow = { name: string; nom: string; tbl: string; comp: string; back: string };

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

  const [recvIn, setRecvIn] = useState<RecvRow[]>(() =>
    initial.receivables
      .filter((r) => r.direction === "incurred")
      .map((r) => ({ cp: r.counterparty ?? "", amt: str(r.amount) })),
  );
  const [recvCol, setRecvCol] = useState<RecvRow[]>(() =>
    initial.receivables
      .filter((r) => r.direction === "collected")
      .map((r) => ({ cp: r.counterparty ?? "", amt: str(r.amount) })),
  );
  const [casts, setCasts] = useState<CastRow[]>(() =>
    initial.casts.map((c) => ({
      name: c.cast_name,
      nom: str(c.nominate_amount),
      tbl: str(c.table_amount),
      comp: str(c.companion_amount),
      back: str(c.back_amount),
    })),
  );

  const [status, setStatus] = useState(initial.status);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "confirm">(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const totalNum = num(totalSales);
  const catSum = useMemo(
    () => SALES_CATEGORIES.reduce((s, c) => s + num(cat[c]), 0),
    [cat],
  );
  const varSum = useMemo(() => vars.reduce((s, r) => s + num(r.amount), 0), [vars]);
  const guestNum = num(guestCount);
  const groupNum = num(groupCount);

  const incurredSum = useMemo(
    () => recvIn.reduce((s, r) => s + num(r.amt), 0),
    [recvIn],
  );
  const collectedSum = useMemo(
    () => recvCol.reduce((s, r) => s + num(r.amt), 0),
    [recvCol],
  );
  const recvBalance = initial.priorReceivableBalance + incurredSum - collectedSum;

  const castBackSum = useMemo(
    () => casts.reduce((s, c) => s + num(c.back), 0),
    [casts],
  );
  const castTotal = useMemo(
    () => casts.reduce((s, c) => s + num(c.nom) + num(c.tbl) + num(c.comp), 0),
    [casts],
  );

  const paySum =
    num(pay.cash) + num(pay.card) + num(pay.emoney) + incurredSum;

  const catMismatch = catSum > 0 && catSum !== totalNum;
  const payMismatch = paySum > 0 && paySum !== totalNum;

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
      payments: PAYMENT_METHODS.map((p) => ({
        method: p.key,
        amount: p.key === "receivable" ? incurredSum : num(pay[p.key]),
      })),
      costs,
      receivables: [
        ...recvIn
          .filter((r) => num(r.amt))
          .map((r) => ({
            direction: "incurred" as const,
            counterparty: r.cp.trim() || null,
            amount: num(r.amt),
          })),
        ...recvCol
          .filter((r) => num(r.amt))
          .map((r) => ({
            direction: "collected" as const,
            counterparty: r.cp.trim() || null,
            amount: num(r.amt),
          })),
      ],
      casts: casts
        .filter((c) => c.name.trim())
        .map((c) => ({
          cast_name: c.name.trim(),
          nominate_amount: num(c.nom),
          table_amount: num(c.tbl),
          companion_amount: num(c.comp),
          back_amount: num(c.back),
        })),
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
  const cpCls =
    "w-32 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100";

  return (
    <div className="space-y-5">
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
        <Row label="現金">
          <input inputMode="numeric" value={pay.cash} onChange={(e) => setPay({ ...pay, cash: e.target.value })} className={inputCls} />
        </Row>
        <Row label="カード">
          <input inputMode="numeric" value={pay.card} onChange={(e) => setPay({ ...pay, card: e.target.value })} className={inputCls} />
        </Row>
        <Row label="電子マネー">
          <input inputMode="numeric" value={pay.emoney} onChange={(e) => setPay({ ...pay, emoney: e.target.value })} className={inputCls} />
        </Row>
        <Row label="売掛（＝下の「発生」合計から自動）" muted>
          <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(incurredSum)}</span>
        </Row>
        <Row label="決済合計" muted>
          <span className={"font-mono text-sm tabular-nums " + (payMismatch ? "text-red-600" : "text-zinc-400")}>
            {yen(paySum)} {paySum === 0 ? "" : payMismatch ? "✕ 総売上と不一致" : "✓ 総売上と一致"}
          </span>
        </Row>
      </Section>

      {/* 売掛（ツケ） */}
      <Section title="売掛（ツケ）">
        <p className="mb-2 text-xs text-zinc-500">前日までの残高：{yen(initial.priorReceivableBalance)}</p>

        <SubHead>当日発生</SubHead>
        <EntryList
          rows={recvIn}
          setRows={setRecvIn}
          cpCls={cpCls}
          amtCls={inputCls}
        />
        <SubHead>当日回収</SubHead>
        <EntryList
          rows={recvCol}
          setRows={setRecvCol}
          cpCls={cpCls}
          amtCls={inputCls}
        />

        <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          <Row label="当日発生 合計" muted>
            <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(incurredSum)}</span>
          </Row>
          <Row label="当日回収 合計" muted>
            <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(collectedSum)}</span>
          </Row>
          <Row label="売掛残高（前日 + 発生 − 回収）" muted>
            <span className="font-mono text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
              {yen(recvBalance)}
            </span>
          </Row>
        </div>
      </Section>

      {/* キャスト別売上 */}
      <Section title="キャスト別売上">
        <div className="space-y-2">
          {casts.map((c, idx) => {
            const rowTotal = num(c.nom) + num(c.tbl) + num(c.comp);
            return (
              <div key={idx} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    placeholder="キャスト名"
                    value={c.name}
                    onChange={(e) => {
                      const v = [...casts];
                      v[idx] = { ...c, name: e.target.value };
                      setCasts(v);
                    }}
                    className={cpCls}
                  />
                  <button
                    type="button"
                    onClick={() => setCasts(casts.filter((_, i) => i !== idx))}
                    className="ml-auto text-sm text-zinc-400 hover:text-red-600"
                  >
                    削除
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="本指名">
                    <input inputMode="numeric" value={c.nom} onChange={(e) => { const v = [...casts]; v[idx] = { ...c, nom: e.target.value }; setCasts(v); }} className={inputCls} />
                  </Field>
                  <Field label="場内">
                    <input inputMode="numeric" value={c.tbl} onChange={(e) => { const v = [...casts]; v[idx] = { ...c, tbl: e.target.value }; setCasts(v); }} className={inputCls} />
                  </Field>
                  <Field label="同伴">
                    <input inputMode="numeric" value={c.comp} onChange={(e) => { const v = [...casts]; v[idx] = { ...c, comp: e.target.value }; setCasts(v); }} className={inputCls} />
                  </Field>
                  <Field label="バック">
                    <input inputMode="numeric" value={c.back} onChange={(e) => { const v = [...casts]; v[idx] = { ...c, back: e.target.value }; setCasts(v); }} className={inputCls} />
                  </Field>
                </div>
                <p className="mt-1 text-right text-xs text-zinc-400">売上 {yen(rowTotal)}</p>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setCasts([...casts, { name: "", nom: "", tbl: "", comp: "", back: "" }])}
          className="mt-2 rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
        >
          ＋ キャストを追加
        </button>
        <div className="mt-2 space-y-1">
          <Row label="キャスト売上 合計" muted>
            <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(castTotal)}</span>
          </Row>
          <Row label="キャストバック 合計（人件費へ）" muted>
            <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(castBackSum)}</span>
          </Row>
        </div>
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
        <Row label="人件費 キャストバック（上のキャスト別から自動）" muted>
          <span className="font-mono text-sm tabular-nums text-zinc-400">{yen(castBackSum)}</span>
        </Row>
        <p className="mt-1 text-xs text-zinc-400">
          月給スタッフ（日割り）・固定費は、月初セットアップ（M2′）から自動で人件費・経費に反映されます。
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
        確定するには「総売上」と、入力済みの「売上内訳」「決済（現金＋カード＋電子＋売掛発生）」の合計が一致している必要があります。確定後も修正できます。
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

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
      {children}
    </p>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function EntryList({
  rows,
  setRows,
  cpCls,
  amtCls,
}: {
  rows: { cp: string; amt: string }[];
  setRows: (r: { cp: string; amt: string }[]) => void;
  cpCls: string;
  amtCls: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2">
          <input
            placeholder="相手（任意）"
            value={r.cp}
            onChange={(e) => {
              const v = [...rows];
              v[idx] = { ...r, cp: e.target.value };
              setRows(v);
            }}
            className={cpCls}
          />
          <input
            inputMode="numeric"
            placeholder="金額"
            value={r.amt}
            onChange={(e) => {
              const v = [...rows];
              v[idx] = { ...r, amt: e.target.value };
              setRows(v);
            }}
            className={amtCls}
          />
          <button
            type="button"
            onClick={() => setRows(rows.filter((_, i) => i !== idx))}
            className="text-sm text-zinc-400 hover:text-red-600"
          >
            削除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { cp: "", amt: "" }])}
        className="rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
      >
        ＋ 明細を追加
      </button>
    </div>
  );
}
