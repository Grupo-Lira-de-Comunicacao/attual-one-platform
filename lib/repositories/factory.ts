import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { StorageAdapter } from "@/lib/catalog-types";
import { createLocalRepositories } from "./local";
import { createSupabaseRepositories } from "./supabase";
export function createRepositories(options:{storage:StorageAdapter;supabase?:SupabaseClient;companyId?:string}){const config=getSupabasePublicConfig();if(config.mode==="local")return createLocalRepositories(options.storage);if(!config.configured)throw new Error("Modo Supabase ativo sem configuração completa.");if(!options.supabase||!options.companyId)throw new Error("Cliente Supabase e empresa selecionada são obrigatórios.");return createSupabaseRepositories(options.supabase,options.companyId)}
