import { createClient } from "@/lib/supabase/server";
import type { Membership } from "@/lib/types";
import { APP_NAME } from "@/lib/brand";

export type Branding = {
  name: string;
  logoUrl: string | null;
  primary: string | null;
  primary2: string | null;
  accent: string | null;
  accentSoft: string | null;
};

const isHex = (s: string | null | undefined): s is string =>
  !!s && /^#[0-9a-fA-F]{6}$/.test(s.trim());

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => clamp(v).toString(16).padStart(2, "0")).join("");

function mix(hex: string, target: [number, number, number], amt: number) {
  const c = hexToRgb(hex);
  return toHex(c.map((v, i) => v + (target[i] - v) * amt));
}

/** ログイン中ユーザーの所属クライアントのブランディング。
 *  コンサル（platform admin）は null（＝中立ブランド）。 */
export async function loadBranding(
  membership: Membership,
): Promise<Branding | null> {
  if (membership.isPlatformAdmin) return null;
  const clientId = membership.clientRoles[0]?.client_id;
  if (!clientId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("name, display_name, brand_primary, brand_accent, logo_url")
    .eq("id", clientId)
    .maybeSingle();
  if (!data) return null;

  const primary = isHex(data.brand_primary) ? data.brand_primary.trim() : null;
  const accent = isHex(data.brand_accent) ? data.brand_accent.trim() : null;

  return {
    name: data.display_name?.trim() || data.name || APP_NAME,
    logoUrl: data.logo_url?.trim() || null,
    primary,
    primary2: primary ? mix(primary, [255, 255, 255], 0.16) : null,
    accent,
    accentSoft: accent ? mix(accent, [255, 255, 255], 0.9) : null,
  };
}

export function brandingCss(b: Branding): string {
  const rules: string[] = [];
  if (b.primary) rules.push(`--navy:${b.primary}`, `--navy-2:${b.primary2}`);
  if (b.accent) rules.push(`--orange:${b.accent}`, `--orange-soft:${b.accentSoft}`);
  return rules.length ? `:root:root:root{${rules.join(";")}}` : "";
}
