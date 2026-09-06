import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionClient = await createSupabaseServerClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Autenticação obrigatória." }, { status: 401 });

  const { data: adminRow } = await sessionClient.from("platform_admins").select("id").eq("id", user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Acesso restrito ao administrador da plataforma." }, { status: 403 });

  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return NextResponse.json({ error: "Serviço de convites não configurado." }, { status: 503 });

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const redirectTo = "https://app.attualone.com.br/auth/callback?next=/nova-senha";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  if (!data.user?.id) return NextResponse.json({ error: "Convite criado sem usuário associado." }, { status: 500 });

  return NextResponse.json({ userId: data.user.id, email }, { status: 201 });
}
