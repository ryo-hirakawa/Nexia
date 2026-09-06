/**
 * テナント隔離テスト（最重要）
 *
 * 「B社の利用者が A社のデータを取得しようとすると 0 件になる」ことを、
 * 本物の Supabase プロジェクト（.env.local の設定先）に対して検証する。
 *
 * 必要な環境変数（.env.local）:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_USER_PASSWORD  (12文字以上)
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.TEST_USER_PASSWORD;

const stamp = Date.now();
const emailA = `iso-${stamp}-a@example.com`;
const emailB = `iso-${stamp}-b@example.com`;

let admin: SupabaseClient;
let userAId = "";
let userBId = "";
let clientAId = "";
let clientBId = "";
let storeAId = "";
let storeBId = "";

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url!, anonKey!);
  const { error } = await c.auth.signInWithPassword({ email, password: password! });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

describe("テナント隔離（RLS）", () => {
  beforeAll(async () => {
    if (!url || !anonKey || !serviceKey || !password) {
      throw new Error(
        "隔離テストには .env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / TEST_USER_PASSWORD が必要です",
      );
    }
    admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 2社ぶんの会社・店舗を作る
    const { data: cs, error: cErr } = await admin
      .from("clients")
      .insert([{ name: `ISO-A-${stamp}` }, { name: `ISO-B-${stamp}` }])
      .select("id, name");
    if (cErr) throw cErr;
    clientAId = cs!.find((r) => r.name.startsWith("ISO-A"))!.id;
    clientBId = cs!.find((r) => r.name.startsWith("ISO-B"))!.id;

    const { data: ss, error: sErr } = await admin
      .from("stores")
      .insert([
        { client_id: clientAId, name: "A店", industry: "bar" },
        { client_id: clientBId, name: "B店", industry: "bar" },
      ])
      .select("id, client_id");
    if (sErr) throw sErr;
    storeAId = ss!.find((r) => r.client_id === clientAId)!.id;
    storeBId = ss!.find((r) => r.client_id === clientBId)!.id;

    // 2人のユーザーを作る（メール確認済み）
    const { data: ua, error: uaErr } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { full_name: "テストA" },
    });
    if (uaErr) throw uaErr;
    userAId = ua.user!.id;

    const { data: ub, error: ubErr } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { full_name: "テストB" },
    });
    if (ubErr) throw ubErr;
    userBId = ub.user!.id;

    // それぞれ自社の「経営者」にする
    const { error: mErr } = await admin.from("client_members").insert([
      { client_id: clientAId, profile_id: userAId, role: "owner" },
      { client_id: clientBId, profile_id: userBId, role: "owner" },
    ]);
    if (mErr) throw mErr;
  });

  afterAll(async () => {
    if (!admin) return;
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
    // clients を消すと stores / members は cascade で消える
    if (clientAId) await admin.from("clients").delete().eq("id", clientAId);
    if (clientBId) await admin.from("clients").delete().eq("id", clientBId);
  });

  test("A社ユーザーは自社の会社・店舗だけ見える", async () => {
    const a = await signIn(emailA);

    const { data: clients } = await a.from("clients").select("id");
    expect(clients?.map((r) => r.id)).toEqual([clientAId]);

    const { data: stores } = await a.from("stores").select("id");
    expect(stores?.map((r) => r.id)).toEqual([storeAId]);
  });

  test("A社ユーザーが B社を id 指定で取っても 0 件", async () => {
    const a = await signIn(emailA);

    const { data: otherClient } = await a
      .from("clients")
      .select("id")
      .eq("id", clientBId);
    expect(otherClient).toEqual([]);

    const { data: otherStore } = await a
      .from("stores")
      .select("id")
      .eq("id", storeBId);
    expect(otherStore).toEqual([]);

    const { data: otherMembers } = await a
      .from("client_members")
      .select("id")
      .eq("client_id", clientBId);
    expect(otherMembers).toEqual([]);
  });

  test("B社ユーザーも同様に自社しか見えない", async () => {
    const b = await signIn(emailB);

    const { data: clients } = await b.from("clients").select("id");
    expect(clients?.map((r) => r.id)).toEqual([clientBId]);

    const { data: otherStore } = await b
      .from("stores")
      .select("id")
      .eq("id", storeAId);
    expect(otherStore).toEqual([]);
  });

  test("A社ユーザーは B社に店舗を作れない（書き込みも遮断）", async () => {
    const a = await signIn(emailA);
    const { data, error } = await a
      .from("stores")
      .insert({ client_id: clientBId, name: "不正店", industry: "bar" })
      .select("id");

    // RLS の with check 違反でエラー、または 0 行
    expect(error !== null || (data ?? []).length === 0).toBe(true);

    // 念のため管理者視点でも増えていないことを確認
    const { data: check } = await admin
      .from("stores")
      .select("id")
      .eq("client_id", clientBId);
    expect(check?.length).toBe(1);
  });

  test("A社ユーザーは自店の日次レコードを作れ、B社からは見えない・書けない", async () => {
    const a = await signIn(emailA);
    const b = await signIn(emailB);

    const { data: created, error: cErr } = await a
      .from("daily_records")
      .insert({ store_id: storeAId, business_date: "2026-09-01", total_sales: 100000 })
      .select("id")
      .single();
    expect(cErr).toBeNull();
    expect(created?.id).toBeTruthy();

    const { data: seen } = await b
      .from("daily_records")
      .select("id")
      .eq("store_id", storeAId);
    expect(seen).toEqual([]);

    const { data: ins, error: insErr } = await b
      .from("daily_records")
      .insert({ store_id: storeAId, business_date: "2026-09-02", total_sales: 1 })
      .select("id");
    expect(insErr !== null || (ins ?? []).length === 0).toBe(true);

    // A社ユーザーは子テーブル（キャスト別売上・売掛）を書ける
    const rid = created!.id;
    const { error: castErr } = await a
      .from("daily_cast_sales")
      .insert({ daily_record_id: rid, cast_name: "あや", nominate_amount: 30000, back_amount: 9000 });
    expect(castErr).toBeNull();
    const { error: recvErr } = await a
      .from("daily_receivable_entries")
      .insert({ daily_record_id: rid, direction: "incurred", amount: 12000 });
    expect(recvErr).toBeNull();

    // B社ユーザーからは見えない
    const { data: castSeen } = await b
      .from("daily_cast_sales")
      .select("id")
      .eq("daily_record_id", rid);
    expect(castSeen).toEqual([]);
  });

  test("月初セットアップ（monthly_setups）も他社からは見えない・書けない", async () => {
    const a = await signIn(emailA);
    const b = await signIn(emailB);

    const { data: ms, error: msErr } = await a
      .from("monthly_setups")
      .insert({ store_id: storeAId, year_month: "2026-09-01" })
      .select("id")
      .single();
    expect(msErr).toBeNull();
    expect(ms?.id).toBeTruthy();

    const { data: seen } = await b
      .from("monthly_setups")
      .select("id")
      .eq("store_id", storeAId);
    expect(seen).toEqual([]);

    const { data: ins, error: insErr } = await b
      .from("monthly_setups")
      .insert({ store_id: storeAId, year_month: "2026-10-01" })
      .select("id");
    expect(insErr !== null || (ins ?? []).length === 0).toBe(true);
  });

  test("一般ユーザーは自分を管理者に昇格できない", async () => {
    const a = await signIn(emailA);
    const { error } = await a
      .from("profiles")
      .update({ is_platform_admin: true })
      .eq("id", userAId);
    expect(error).not.toBeNull();

    const { data: prof } = await admin
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userAId)
      .single();
    expect(prof?.is_platform_admin).toBe(false);
  });
});
