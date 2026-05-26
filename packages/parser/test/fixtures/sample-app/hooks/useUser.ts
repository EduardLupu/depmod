import { apiClient } from "@/lib/api";
import type { User } from "@/lib/utils";

export function useUser(): { user: User | null; loading: boolean } {
  const data = apiClient.get("/me") as User | null;
  return { user: data, loading: false };
}
