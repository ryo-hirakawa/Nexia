"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfileName, changePassword } from "./actions";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-navy";

export default function SettingsForm({
  email,
  fullName,
}: {
  email: string;
  fullName: string;
}) {
  const router = useRouter();

  const [name, setName] = useState(fullName);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nameSaving, setNameSaving] = useState(false);

  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  async function saveName() {
    setNameMsg(null);
    setNameSaving(true);
    const res = await updateProfileName(name);
    setNameMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
    setNameSaving(false);
    if (res.ok) router.refresh();
  }

  async function savePw() {
    setPwMsg(null);
    if (nw !== nw2) {
      setPwMsg({ ok: false, text: "新しいパスワードが一致しません" });
      return;
    }
    setPwSaving(true);
    const res = await changePassword(cur, nw);
    setPwSaving(false);
    if (res.ok) {
      setPwMsg({ ok: true, text: res.message });
      setCur("");
      setNw("");
      setNw2("");
    } else {
      setPwMsg({ ok: false, text: res.error });
    }
  }

  return (
    <div className="space-y-5">
      <Msg m={null} />

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">アカウント</h2>
        <p className="mb-3 text-sm text-muted">メールアドレス：{email}</p>
        <div className="space-y-1.5">
          <label htmlFor="name" className="block text-sm font-medium">
            表示名
          </label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <Msg m={nameMsg} />
        <button
          type="button"
          disabled={nameSaving}
          onClick={saveName}
          className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-50"
        >
          {nameSaving ? "保存中…" : "表示名を保存"}
        </button>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">パスワード変更</h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="cur" className="block text-sm font-medium">
              現在のパスワード
            </label>
            <input id="cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nw" className="block text-sm font-medium">
              新しいパスワード（8文字以上）
            </label>
            <input id="nw" type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} className={field} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="nw2" className="block text-sm font-medium">
              新しいパスワード（確認）
            </label>
            <input id="nw2" type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} className={field} />
          </div>
        </div>
        <Msg m={pwMsg} />
        <button
          type="button"
          disabled={pwSaving || !cur || !nw || !nw2}
          onClick={savePw}
          className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-2 disabled:opacity-50"
        >
          {pwSaving ? "変更中…" : "パスワードを変更"}
        </button>
      </section>
    </div>
  );
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p
      className={
        "mt-3 rounded-lg border px-3 py-2 text-sm " +
        (m.ok
          ? "border-good/30 bg-good/5 text-good"
          : "border-bad/30 bg-bad/5 text-bad")
      }
    >
      {m.text}
    </p>
  );
}
