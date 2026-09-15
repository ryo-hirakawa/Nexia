import { createClient } from "@/lib/supabase/server";

export type StaffMember = { id: string; name: string; hourlyWage: number };

export async function loadStaffMembers(storeId: string): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_members")
    .select("id, name, hourly_wage, sort_order")
    .eq("store_id", storeId)
    .order("sort_order");
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, hourlyWage: Number(r.hourly_wage) }));
}
