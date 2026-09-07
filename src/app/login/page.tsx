import { signInWithGoogle, signInWithPassword } from "./actions";
import { APP_NAME, APP_SUFFIX } from "@/lib/brand";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next = "/dashboard" } = await searchParams;

  const field =
    "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-navy";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-navy">
              {APP_NAME}
            </span>
            <span className="text-xs font-medium text-muted">{APP_SUFFIX}</span>
          </div>
          <p className="text-sm text-muted">店舗の売上・損益をひと目で</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad"
            >
              {error}
            </p>
          ) : null}

          <form action={signInWithPassword} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium">
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={field}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium">
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={field}
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-navy px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-2"
            >
              ログイン
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            または
            <span className="h-px flex-1 bg-line" />
          </div>

          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <button
              type="submit"
              className="w-full rounded-lg border border-line px-3 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2"
            >
              Google でログイン
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          アカウントはコンサル担当者が発行します。
        </p>
      </div>
    </main>
  );
}
