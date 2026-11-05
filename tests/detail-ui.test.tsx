import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import AttackTimeline from '../components/AttackTimeline';
import EventsTable from '../components/EventsTable';
import {readFileSync} from 'node:fs';
describe('detail summary and evidence presentation',()=>{
 it('renders aggregate timeline totals independent of current event page',()=>{
  const html=renderToStaticMarkup(<AttackTimeline timeline={[{date:'2026-01-01',count:66}]} rangeDays={30} onRangeChange={()=>{}}/>);
  expect(html).toContain('66 events');expect(html).toContain('UTC');
 });
 it('does not label an event fetch failure as an empty evidence set',()=>{
  const html=renderToStaticMarkup(<EventsTable events={[]} total={0} page={1} limit={15} onPageChange={()=>{}} onFilterChange={()=>{}} error="Synthetic fetch failure"/>);
  expect(html).toContain('Synthetic fetch failure');expect(html).not.toContain('No alert events found');
 });
 it('uses scoped summary endpoint and resets page when changing filters',()=>{
  const source=readFileSync(new URL('../app/ip/[ip]/page.tsx',import.meta.url),'utf8');
  expect(source).toContain('/summary?');expect(source).toContain('timeline={summaryData?.timeline');expect(source).toContain('setPage(1)');expect(source).not.toContain('for (const ev of events)');expect(source).not.toContain('events={events} />');
 });
});
