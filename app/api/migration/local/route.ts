import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { importLocalPreview } from "@/lib/migration/supabase-importer";
import type { LocalMigrationPreview } from "@/lib/migration/local-to-supabase";
export async function POST(request:Request){const store=await cookies(),companyId=store.get("attual_company_id")?.value;if(!companyId)return NextResponse.json({error:"Selecione uma empresa."},{status:400});const preview=await request.json()as LocalMigrationPreview;if(preview.version!==1||!preview.fingerprint)return NextResponse.json({error:"Prévia inválida."},{status:400});try{const supabase=await createSupabaseServerClient();const result=await importLocalPreview(supabase,companyId,preview);return NextResponse.json(result)}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Falha de importação."},{status:500})}}
