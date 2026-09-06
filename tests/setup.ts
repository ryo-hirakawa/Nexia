import { config } from "dotenv";

// テストは .env.local の値（Supabase の URL / キー）を読む
config({ path: ".env.local" });
