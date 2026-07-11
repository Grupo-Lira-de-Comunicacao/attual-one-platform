"use client";
import { Building2, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
export function NoCompanyScreen() { const logout = async () => { await createSupabaseBrowserClient().auth.signOut(); window.location.assign("/login"); }; return <main className="auth-page"><section className="auth-panel no-company"><span><Building2 /></span><h1>Nenhuma empresa vinculada</h1><p>Seu acesso foi confirmado, mas ainda não há empresa associada ao usuário. Peça ao proprietário para criar o vínculo.</p><button className="primary-button" onClick={logout}><LogOut />Sair</button></section></main>; }
