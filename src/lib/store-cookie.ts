/** 店舗をまたぐページ遷移でも直前に見ていた店舗を覚えておくための Cookie 名。
 *  サーバー側(page.tsx が cookies() で読む)とクライアント側(店舗切り替えUIが
 *  setLastStoreCookie で書く)の両方から参照するため、値だけをここに置く。 */
export const LAST_STORE_COOKIE = "nexia_last_store";

/** クライアント側から呼ぶ。コンポーネント/フックの外の関数にしているのは、
 *  React Compiler の lint がコンポーネント内でのグローバル値(document)への
 *  直接代入を許さないため。 */
export function setLastStoreCookie(storeId: string) {
  document.cookie = `${LAST_STORE_COOKIE}=${storeId}; path=/; max-age=31536000; samesite=lax`;
}
