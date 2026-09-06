import { redirect } from "next/navigation";

export default function Home() {
  // 未ログインなら middleware が /login へ飛ばす
  redirect("/dashboard");
}
