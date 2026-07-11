"use client";
import { LogOut } from "lucide-react";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
export function SessionAction(){if(getSupabasePublicConfig().mode!=="supabase")return null;const logout=async()=>{await createSupabaseBrowserClient().auth.signOut();window.location.assign("/login")};return <button className="icon-button" aria-label="Sair" onClick={logout}><LogOut size={16}/></button>}
