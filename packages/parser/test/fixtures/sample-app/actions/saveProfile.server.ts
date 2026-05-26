import { apiClient } from "@/lib/api";

export async function saveProfile(name: string) {
  return apiClient.get(`/profile?name=${encodeURIComponent(name)}`);
}
