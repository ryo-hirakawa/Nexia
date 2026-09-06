import { NextResponse } from "next/server";

/** 一時的な診断用エンドポイント。M0′ の接続確認が済んだら削除する。 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  let authHealth: unknown = null;
  try {
    const r = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anon },
      cache: "no-store",
    });
    authHealth = { status: r.status, body: await r.text() };
  } catch (e) {
    authHealth = { error: String(e) };
  }

  return NextResponse.json({
    supabaseUrl: url,
    anonKeyLen: anon.length,
    anonKeyTail: anon.slice(-6),
    serviceKeyLen: service.length,
    serviceKeyTail: service.slice(-6),
    authHealth,
  });
}
