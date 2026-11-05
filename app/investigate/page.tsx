import React from 'react';
import InvestigationWorkbench from '../../components/investigation/InvestigationWorkbench';
import { queryIndicatorInput, type InvestigationQuery } from '../../components/investigation/investigation-state';

export default async function InvestigatePage({ searchParams }: { searchParams: Promise<InvestigationQuery> }) {
  const query = await searchParams;
  const input = queryIndicatorInput(query);
  const mode = query.mode === 'external' ? 'external' : 'local';
  return <InvestigationWorkbench key={JSON.stringify([mode, input])} initialInput={input} initialMode={mode} />;
}
