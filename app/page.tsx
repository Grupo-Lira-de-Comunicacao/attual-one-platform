import { RealDashboard } from "@/components/real-dashboard";
import { getSelectedCompanyId } from "@/lib/supabase/session";

export default async function DashboardPage() {
  const companyId = await getSelectedCompanyId();
  return <RealDashboard companyId={companyId ?? undefined} />;
}
