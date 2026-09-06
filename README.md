# 店舗売上管理ツール

コンサル会社が各クライアント（顧客の店舗）へ提供する、売上・損益の管理 Web アプリ。
最初のパイロットは「バー 1 店舗」。まずコア 4 機能で運用開始する。

- 開発方針・仕様は `CLAUDE.md` と Claude Artifacts（構想メモ / ワイヤーフレーム / ロードマップ / 実装プラン）を参照。
- いまのマイルストーン: **M0′ 基盤**（ログイン・テナント構造・RLS・隔離テスト）

## 技術スタック

Next.js 16 (App Router) / TypeScript / Supabase (PostgreSQL + Auth) / Tailwind CSS v4 / Vitest

---

## セットアップ手順（M0′）

### 1. Node.js

このリポジトリは Node.js 24 系で動作確認。`node -v` で確認。

### 2. 依存パッケージ

```bash
npm install
```

### 3. Supabase プロジェクトを作る

1. <https://supabase.com> でプロジェクトを新規作成（無料枠）。リージョンは Tokyo 推奨。
2. **Project Settings → API** を開き、次の 3 つを控える:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key（秘密。絶対に公開しない）
3. `.env.local`（すでに仮の値で存在）を開き、本物の値に差し替える:

   ```
   NEXT_PUBLIC_SUPABASE_URL=（Project URL）
   NEXT_PUBLIC_SUPABASE_ANON_KEY=（anon key）
   SUPABASE_SERVICE_ROLE_KEY=（service_role key）
   TEST_USER_PASSWORD=（任意の12文字以上。隔離テスト用）
   ```

### 4. データベースの構造を作る（マイグレーション適用）

Supabase ダッシュボードの **SQL Editor** で、次の 2 ファイルの中身を順番に貼り付けて実行する:

1. `supabase/migrations/0001_init_tenancy.sql`
2. `supabase/migrations/0002_rls_policies.sql`

> 上級者向け: Supabase CLI を使うなら `npx supabase link` のあと `npm run db:push`。

### 5. Google ログイン（任意・後回し可）

メール＋パスワードは設定不要で動く。Google ログインを使う場合は
Supabase ダッシュボード **Authentication → Providers → Google** に、
Google Cloud で発行した Client ID / Secret を設定し、
リダイレクト URL に `https://<プロジェクト>.supabase.co/auth/v1/callback` を追加する。

### 6. 起動

```bash
npm run dev
```

<http://localhost:3000> を開く → `/login` にリダイレクトされる。

### 7. 最初の管理者ユーザーを作る

1. `npm run dev` の画面からは新規登録できない（アカウントは管理者が発行する方針）。
   Supabase ダッシュボード **Authentication → Users → Add user** で自分のメール＋パスワードを作成（Auto Confirm On）。
2. SQL Editor で自分を管理者に昇格:

   ```sql
   update public.profiles set is_platform_admin = true
   where id = (select id from auth.users where email = 'あなたのメール');
   ```

3. ログインすると「管理者（コンサル）」として全画面が見える。

---

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド |
| `npm run typecheck` | 型チェック |
| `npm run lint` | Lint |
| `npm run test` | 全テスト（隔離テスト含む。要 `.env.local` の本物の値） |
| `npm run test:isolation` | テナント隔離テストのみ |

## デプロイ（Vercel）

1. このリポジトリを GitHub に push。
2. <https://vercel.com> で **New Project** → GitHub リポジトリを選択。
3. Environment Variables に `.env.local` と同じ 4 つを設定（Production / Preview 両方）。
4. デプロイ。以後は push するたび自動で公開される。Preview デプロイがステージング（確認用）になる。
