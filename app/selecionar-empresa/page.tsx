import { CompanySelector } from "@/components/company-selector";
import { getSessionContext } from "@/lib/supabase/session";
export default async function SelectCompanyPage() { const context = await getSessionContext(); return <CompanySelector memberships={context.memberships} />; }
