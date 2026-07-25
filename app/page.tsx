import { RealDashboard } from "@/components/real-dashboard";
import { getSelectedCompanyId, getSessionContext } from "@/lib/supabase/session";
import { resolveIdentity } from "@/lib/supabase/identity";

export default async function DashboardPage() {
  const [companyId, session] = await Promise.all([getSelectedCompanyId(), getSessionContext()]);
  const identity = resolveIdentity({ user: session.user, memberships: session.memberships, selectedCompanyId: companyId });
  return <RealDashboard companyId={companyId ?? undefined} userName={identity.userName} companyName={identity.companyName} />;
}
