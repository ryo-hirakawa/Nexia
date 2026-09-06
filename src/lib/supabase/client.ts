import { createBrowserClient } from "@supabase/ssr";

/** ブラウザ側で使う Supabase クライアント（公開鍵のみ・RLS が効く） */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
