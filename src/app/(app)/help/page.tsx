import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";

export default async function HelpPage() {
  await requireMembership();
  const supabase = await createClient();

  // 自分が見られる店舗の業態を見て、バー版/飲食版どちらの案内を出すか決める
  // （RLS で自分の店舗しか返らない）。両方あれば両方の案内を出す。
  const { data: storeRows } = await supabase.from("stores").select("industry");
  const industries = new Set((storeRows ?? []).map((s) => s.industry));
  const hasBar = industries.size === 0 || industries.has("bar");
  const hasRestaurant = industries.has("restaurant");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{APP_NAME} の使い方</h1>
        <p className="mt-1 text-sm text-muted">
          毎日 5 分の入力で、売上・利益がダッシュボードに反映されます。
        </p>
      </div>

      <Step n={1} title="月初セットアップ（月に1回）" badge="月のはじめに">
        <p>
          <NavLink href="/setup">月初セットアップ</NavLink>
          を開き、その月の内容を登録します。
        </p>
        <ul>
          <li>
            <b>月間 売上目標</b>：達成率・着地予測の基準になります。
          </li>
          <li>
            <b>売上カテゴリ</b>：日次入力の「売上内訳」で出てくる項目
            {hasRestaurant ? "（例：フード／ドリンク）" : hasBar ? "（例：セット・チャージ／ボトル／ドリンク）" : ""}
            。業態に合わせて自由に追加・削除できます。
          </li>
          <li>
            <b>固定費</b>：家賃・リース・保険・通信・借入返済など。金額は月額で入れると、
            日割り（月額 ÷ その月の日数）が自動計算されます。
          </li>
          <li>
            <b>月給スタッフ</b>：名前と月額（社保・交通費込みの会社負担額）。
            ダッシュボードでは<b>人件費</b>に集計されます。
          </li>
          <li>
            <b>流動費の費目リスト</b>：日次入力の「流動費」で選べる項目。
          </li>
          <li>
            <b>取引先マスタ</b>
            ：仕入れ・流動費の内訳を取引先ごとに記録したいときの選択肢。登録しておけば毎回入力せず選ぶだけで済みます（記録するかどうかは任意）。
          </li>
        </ul>
        <p className="text-muted">
          翌月は「前月からコピー」で、変わったところだけ直せます。金額を月の途中で変えて保存すると、
          その月の全日の日割りが計算し直されます。
        </p>
      </Step>

      <Step n={2} title="日次入力（毎日）" badge="閉店後に">
        <p>
          <NavLink href="/input">日次入力</NavLink>
          を開くと、記録がある一番新しい日が表示されます。◀ 前日 / 翌日 ▶ で日付を移動できます。
        </p>
        <ul>
          <li>
            <b>営業日は開店日ベース</b>：深夜〜早朝に閉店しても、開店した日の売上として入れます。
          </li>
          <li>
            <b>総売上</b> と、<b>売上内訳（カテゴリ）</b>・<b>決済</b> の合計が一致していないと「確定」できません
            （画面に「✓ 一致」「✕ 不一致」が出ます）。
          </li>
          <li>
            <b>仕入れ</b>：通常はカテゴリごとの合計金額を入れるだけ。「取引先の内訳を記録する」を開くと、
            取引先・現金／掛（買掛）を明細で残せます（開くと、上の合計欄は内訳の合計から自動計算に変わります）。
          </li>
          <li>
            <b>流動費</b>にも、費目ごとに取引先・現金／掛（任意）を記録できます。
          </li>
          {hasBar ? (
            <li>
              <b>売掛（ツケ）</b>：発生・回収を明細で入れると、残高が自動で繰り越されます。
              決済の「売掛」は発生の合計から自動で入ります。（バー版のみ）
            </li>
          ) : null}
          {hasBar ? (
            <li>
              <b>キャスト別売上</b>：本指名 / 場内 / 同伴 / バック。バックの合計は人件費に自動計上されます。（バー版のみ）
            </li>
          ) : null}
          <li>
            <b>固定費・月給スタッフ（日割り）</b> は入力不要。月初セットアップの内容が自動表示されます。
          </li>
        </ul>
        <p className="text-muted">
          途中まで入れて「下書き保存」、完成したら「確定して送信」。確定後も直せます。
        </p>
      </Step>

      <Step n={3} title="ダッシュボードで見る" badge="いつでも">
        <p>
          <NavLink href="/dashboard">ダッシュボード</NavLink>
          で <b>日 / 週 / 月</b> を切り替えて確認します。◀ ▶ で期間を移動。
        </p>
        <ul>
          <li>
            <b>週</b>：月曜はじまり・日曜締め。月をまたがず、月初・月末で区切ります。
          </li>
          <li>
            <b>月</b>：その月の1日から選択日までの営業日の累計です。
          </li>
          <li>
            <b>総売上</b>と<b>達成率</b>（対 目標）、<b>営業利益</b>・利益率、
            <b>FL コスト率</b>（＝(原価＋人件費) ÷ 売上）、客数・客単価{hasBar ? "・売掛残高" : ""}、着地予測。
          </li>
          <li>
            <b>経費の内訳</b>：仕入れ・人件費・流動費・<b>取引先別</b>（現金／掛の内訳込み）を、横棒グラフで常に見られます。
          </li>
          <li>
            グラフ：売上推移、費目別の経費、カテゴリ別、決済構成、曜日別平均{hasBar ? "、キャスト別ランキング" : ""}。
          </li>
        </ul>
      </Step>

      <div className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">用語</h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Term t="営業日" d="開店した日。深夜跨ぎは開店日に計上" />
          <Term t="FL コスト率" d="(原価 ＋ 人件費) ÷ 売上" />
          <Term t="日割り" d="月額 ÷ その月の実日数" />
          <Term t="掛（買掛）" d="仕入れ・流動費を後払いで買った分。取引先ごとに集計されます" />
          {hasBar ? <Term t="売掛残高" d="前日残高 ＋ 当日発生 − 当日回収" /> : null}
          <Term t="着地予測" d="今の日割りペースで月末まで進んだ場合の見込み" />
          <Term t="下書き / 確定" d="確定するとダッシュボードに反映。確定後も修正可" />
        </dl>
      </div>

      <p className="text-sm text-muted">
        困ったときは担当のコンサルまでご連絡ください。
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  badge,
  children,
}: {
  n: number;
  title: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
          {n}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="ml-auto rounded-full bg-orange-soft px-2.5 py-0.5 text-xs font-medium text-orange">
          {badge}
        </span>
      </div>
      <div className="space-y-2 text-sm leading-relaxed [&_b]:font-semibold [&_li]:my-0.5 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-navy underline">
      {children}
    </Link>
  );
}

function Term({ t, d }: { t: string; d: string }) {
  return (
    <div>
      <dt className="font-medium">{t}</dt>
      <dd className="text-muted">{d}</dd>
    </div>
  );
}
