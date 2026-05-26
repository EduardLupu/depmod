import { apiClient } from "@/lib/api";

export async function GET() {
  const users = await apiClient.get("/users");
  return Response.json(users);
}

export async function POST(req: Request) {
  const body = await req.json();
  return Response.json({ ok: true, body });
}
