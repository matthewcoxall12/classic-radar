import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserSubmission } from "@/lib/types";

export async function getUserSubmissions(): Promise<UserSubmission[]> {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("ClassicsGo submission queue query failed", { code: error.code });
    return [];
  }
  return (data as UserSubmission[] | null) ?? [];
}
