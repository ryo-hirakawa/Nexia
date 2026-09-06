/** 会社内での役割 */
export type ClientRole = "owner" | "manager";

/** 画面表示用の役割ラベル */
export const ROLE_LABEL: Record<ClientRole, string> = {
  owner: "経営者",
  manager: "店舗責任者",
};

export const INDUSTRY_LABEL: Record<string, string> = {
  bar: "バー・ナイト",
  cafe: "カフェ",
  restaurant: "飲食",
  beauty: "美容",
  retail: "物販",
};

export type Client = {
  id: string;
  name: string;
  created_at: string;
};

export type Store = {
  id: string;
  client_id: string;
  name: string;
  industry: string;
  template: string;
  timezone: string;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  is_platform_admin: boolean;
  created_at: string;
};

/** ログイン中ユーザーの権限まとめ */
export type Membership = {
  profile: Profile;
  isPlatformAdmin: boolean;
  clientRoles: { client_id: string; role: ClientRole }[];
};
