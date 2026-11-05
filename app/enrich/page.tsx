import { redirect } from 'next/navigation';
import { legacyInvestigationUrl, type InvestigationQuery } from '../../components/investigation/investigation-state';

export default async function Page({ searchParams }: { searchParams: Promise<InvestigationQuery> }) {
  redirect(legacyInvestigationUrl('external', await searchParams));
}
