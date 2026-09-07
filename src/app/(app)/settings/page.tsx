import { requireMembership } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const membership = await requireMembership();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted">アカウント情報とパスワード</p>
      </div>
      <SettingsForm
        email={user?.email ?? ""}
        fullName={membership.profile.full_name ?? ""}
      />
    </div>
  );
}
