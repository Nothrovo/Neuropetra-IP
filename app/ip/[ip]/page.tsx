'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import type { IntelRow } from '@/lib/db';
import type { IpIntelEventRow } from '@/lib/mock-data';
import type { ScoreBreakdown } from '@/lib/scoring';
import type { IpSummary,TelemetryScope } from '@/lib/telemetry-aggregates';
interface DetailResponse {found:boolean;intel:IntelRow;scoring:ScoreBreakdown;hasCriticalOutcome:boolean;relatedIps:IntelRow[];cacheFreshness:{ageDays:string;ttlDaysLeft:string}|null}
interface SummaryResponse extends IpSummary {scope:TelemetryScope}
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Layers,RefreshCw,ChevronLeft,HelpCircle,Copy,Check } from 'lucide-react';
import ScoreGauge from '@/components/ScoreGauge';
import DefangButton from '@/components/DefangButton';
import MitreHeatmap from '@/components/MitreHeatmap';
import AttackTimeline from '@/components/AttackTimeline';
import EventsTable from '@/components/EventsTable';
import OutcomePanel from '@/components/OutcomePanel';

export default function IpDetailPage() {
  const params = useParams();
  const rawIp = decodeURIComponent((params.ip as string) || '').trim();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<{ alertType?: string; outcome?: string; targetHost?: string }>({});
  const [copiedIp, setCopiedIp] = useState(false);
  const [range,setRange]=useState(()=>({days:30,to:new Date().toISOString()}));
  const scopeParams=new URLSearchParams({from:new Date(Date.parse(range.to)-range.days*86400000).toISOString(),to:range.to,...(filters.alertType?{alert_type:filters.alertType}:{}),...(filters.outcome?{outcome:filters.outcome}:{}),...(filters.targetHost?{target_host:filters.targetHost}:{})}).toString();
  const {data:summaryData,error:summaryError,isLoading:isLoadingSummary}=useQuery<SummaryResponse>({queryKey:['ip-summary',rawIp,scopeParams],queryFn:async()=>{const response=await fetch(`/api/ip/${encodeURIComponent(rawIp)}/summary?${scopeParams}`);if(!response.ok)throw new Error('Failed to retrieve scoped aggregates');return response.json();}});


  // 1. Fetch IP Intel Summary
  const {
    data: intelData,
    isLoading: isLoadingIntel,
    error: intelError,
  } = useQuery<DetailResponse>({
    queryKey: ['ip-intel', rawIp,scopeParams],
    queryFn: async () => {
      const res = await fetch(`/api/ip/${encodeURIComponent(rawIp)}?${scopeParams}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch intel');
      }
      return res.json();
    },
  });

  // 2. Fetch IP Events (paginated & filterable)
  const { data: eventsData, isLoading: isLoadingEvents,error:eventsError } = useQuery<{events:IpIntelEventRow[];total:number}>({
    queryKey: ['ip-events', rawIp, page, scopeParams],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        limit: '15',
        offset: ((page - 1) * 15).toString(),
        ...(filters.alertType ? { alert_type: filters.alertType } : {}),
        ...(filters.outcome ? { outcome: filters.outcome } : {}),
        ...(filters.targetHost ? { target_host: filters.targetHost } : {}),
      });
      const res = await fetch(`/api/ip/${encodeURIComponent(rawIp)}/events?${queryParams}&${scopeParams}`);
      if (!res.ok) throw new Error('Failed to load events');
      return res.json();
    },
  });

  function handleCopyIp() {
    navigator.clipboard.writeText(rawIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  }

  if (isLoadingIntel) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center space-y-3 font-sans">
        <RefreshCw className="mx-auto h-7 w-7 text-zinc-400 animate-spin" />
        <p className="text-xs font-mono text-zinc-400">Loading intelligence telemetry for {rawIp}...</p>
      </div>
    );
  }

  if (intelError) return <div role="alert" className="p-8 text-red-400">Unable to load intelligence: {intelError.message}. This is not an empty telemetry result.</div>;
  if (!intelData?.found) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center space-y-5 font-sans">
        <div className="inline-flex p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-zinc-400">
          <HelpCircle className="h-8 w-8" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold font-mono text-zinc-100">
            No Telemetry Recorded for <span className="text-amber-400">{rawIp}</span>
          </h1>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            This IP address has not been observed in any local Wazuh alerts or cached in the PostgreSQL threat database.
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141824] px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.06] transition"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Return to Search</span>
          </Link>
          <Link
            href={`/investigate?mode=external&ip=${encodeURIComponent(rawIp)}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.08] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.14] transition"
          >
            <span>Live Enrich Externally →</span>
          </Link>
        </div>
      </div>
    );
  }

  const intel = intelData.intel;
  const scoring = intelData.scoring;
  const freshness = intelData.cacheFreshness;
  const relatedIps = intelData.relatedIps || [];
  const events = eventsData?.events || [];
  const totalEvents = eventsData?.total || 0;

  const outcomeList=summaryData?.outcomes??[];
  const lastEvent=summaryData?.latestEvent;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Navigation Breadcrumb & Meta Actions */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Investigation Overview</span>
        </Link>

        <div className="flex items-center gap-2">
          {freshness && (
            <span className="text-[10px] font-mono text-zinc-500">
              Cached {freshness.ageDays}d ago &bull; {freshness.ttlDaysLeft}d TTL
            </span>
          )}
          <span className="text-zinc-700">|</span>
          <span className="text-[10px] font-mono text-zinc-400 uppercase bg-white/[0.06] px-2 py-0.5 rounded border border-white/[0.08]">
            Source: {intel.reputation_source || 'PostgreSQL'}
          </span>
        </div>
      </div>

      {/* Critical Banner (If breach / allowed outcomes detected) */}
      {summaryError ? <p role="alert">{summaryError.message}</p> : isLoadingSummary ? <p role="status">Loading scoped aggregates…</p> : <OutcomePanel outcomes={outcomeList} hasCritical={summaryData?.hasCriticalOutcome??false} />}
      <p className="text-xs text-zinc-400">Selected UTC half-open interval: {new Date(Date.parse(range.to)-range.days*86400000).toISOString()} ≤ event time &lt; {range.to}. Summary and score cover all matching events, not the displayed page. Identity metadata below is all-time.</p>

      {/* Triage Command Header: IP Identity + The 3 Core Triage Anchors */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-5 shadow-lg">
        {/* Top: IP Headline & Attribution */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-tabular">
                {rawIp}
              </span>
              <button
                onClick={handleCopyIp}
                title="Copy raw IP address"
                className="inline-flex items-center gap-1 rounded bg-white/[0.06] border border-white/[0.08] px-2 py-1 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.1] transition"
              >
                {copiedIp ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="text-[10px] font-mono">{copiedIp ? 'Copied' : 'Raw'}</span>
              </button>
              <DefangButton ip={rawIp} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-sans text-zinc-400">
              <span className="rounded bg-white/[0.06] px-1.5 py-0.2 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
                {intel.country_code || 'XX'}
              </span>
              <span>{intel.geo_json?.country || 'Unknown Location'}</span>
              <span className="text-zinc-600">&bull;</span>
              {intel.isp ? (
                <Link
                  href={`/providers/${encodeURIComponent(intel.isp)}`}
                  className="text-zinc-300 hover:text-white hover:underline transition font-medium"
                >
                  {intel.isp}
                </Link>
              ) : (
                <span className="text-zinc-500">Unspecified ISP</span>
              )}
              {intel.geo_json?.as && (
                <>
                  <span className="text-zinc-600">&bull;</span>
                  <span className="font-mono text-[11px] text-zinc-500">{intel.geo_json.as}</span>
                </>
              )}
            </div>
          </div>

          {/* Quick Dates */}
          <div className="flex items-center gap-4 text-xs font-mono text-right text-zinc-400">
            <div>
              <span className="text-[10px] uppercase font-sans text-zinc-500 block">First Seen</span>
              <span className="text-zinc-200">
                {intel.first_seen ? new Date(intel.first_seen).toLocaleDateString('id-ID', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }) : 'Not observed'}
              </span>
            </div>
            <div className="border-l border-white/[0.08] pl-4">
              <span className="text-[10px] uppercase font-sans text-zinc-500 block">Last Seen</span>
              <span className="text-zinc-200">
                {intel.last_seen ? new Date(intel.last_seen).toLocaleDateString('id-ID', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }) : 'Not observed'}
              </span>
            </div>
          </div>
        </div>

        {/* 🌟 3 Most Searched Triage Pillars (Abuse Confidence, Last Event, Target Hosts) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Pillar 1: Abuse Confidence */}
          <div className="rounded-lg border border-white/[0.08] bg-[#141824] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-sans">
                1. Abuse Confidence
              </span>
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${
                  (intel.abuse_score ?? 0) >= 75
                    ? 'bg-red-950/40 text-red-400 border-red-800/60'
                    : (intel.abuse_score ?? 0) >= 40
                    ? 'bg-amber-950/40 text-amber-400 border-amber-800/60'
                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                }`}
              >
                {intel.abuse_score !== null ? `${intel.abuse_score}% Confidence` : 'Not Evaluated'}
              </span>
            </div>
            <p className="text-xs text-zinc-300 font-sans">
              {typeof intel.reputation_json?.totalReports==='number'
                ? `${intel.reputation_json.totalReports} global abuse reports across ${intel.reputation_json.numDistinctUsers || 'multiple'} contributors.`
                : 'AbuseIPDB reputation telemetry recorded in PostgreSQL.'}
            </p>
            <div className="text-[10px] text-zinc-500 font-mono">
              VirusTotal: {intel.vt_malicious !== null ? `${intel.vt_malicious} vendors malicious` : 'Not evaluated'}
            </div>
          </div>

          {/* Pillar 2: Last Incident Event */}
          <div className="rounded-lg border border-white/[0.08] bg-[#141824] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-sans">
                2. Last Incident Event
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {lastEvent ? new Date(lastEvent.seen_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
              </span>
            </div>
            {lastEvent ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-200">
                  <span className="font-semibold text-amber-400">{lastEvent.alert_type}</span>
                  <span className="text-zinc-600">&bull;</span>
                  <span className="text-zinc-400 truncate">{lastEvent.attack_subtype || 'general'}</span>
                </div>
                <p className="text-[11px] text-zinc-400 font-mono truncate" title={lastEvent.raw_summary??undefined}>
                  {lastEvent.raw_summary || lastEvent.endpoint || 'Security rule triggered'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 font-sans">No recent event log entries attached.</p>
            )}
            <div className="text-[10px] text-zinc-500 font-mono">
              Total Recorded Alerts: <span className="text-zinc-300 font-semibold">{intel.total_alert_count ?? 0}</span>
            </div>
          </div>

          {/* Pillar 3: Target Host(s) Attacked */}
          <div className="rounded-lg border border-white/[0.08] bg-[#141824] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-sans">
                3. Targeted Hosts
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {intel.target_hosts?.length || 0} Victim Host(s)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {intel.target_hosts && intel.target_hosts.length > 0 ? (
                intel.target_hosts.map((host: string) => (
                  <span
                    key={host}
                    className="rounded bg-[#0e111a] border border-white/[0.06] px-2 py-0.5 text-xs font-mono text-zinc-200"
                  >
                    {host}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500 font-sans">No specific internal hosts mapped.</span>
              )}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono truncate">
              Probed Endpoints: {intel.endpoints_targeted?.slice(0, 3).join(', ') || '/'}
            </div>
          </div>
        </div>

        {/* Threat Verdict Engine Strip (Composite Score) */}
        <div className="border-t border-white/[0.06] pt-4">
          <ScoreGauge scoring={scoring} />
        </div>
      </div>

      {/* Chronological Incident Timeline */}
      {!summaryError && !isLoadingSummary && <AttackTimeline timeline={summaryData?.timeline??[]} rangeDays={range.days} onRangeChange={days=>{setRange({days,to:new Date().toISOString()});setPage(1);}} />}

      {/* MITRE ATT&CK Matrix Alignment (Ordered by Enterprise Kill Chain) */}
      <MitreHeatmap techniques={intel.mitre_tactics || []} />

      {/* Granular Telemetry Events Table with Plain-Text Log Expansion */}
      <EventsTable
        events={events}
        total={totalEvents}
        page={page}
        limit={15}
        onPageChange={setPage}
        onFilterChange={value=>{setFilters(value);setPage(1);}}
        error={eventsError?.message}
        loading={isLoadingEvents}
        availableHosts={intel.target_hosts || []}
      />

      {/* Related Threat Actors in Same Subnet or ASN */}
      {relatedIps.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-400" />
                <span>Correlated Threat Actors (Same Subnet / ASN)</span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Other adversarial IPs in local telemetry sharing the same network provider or CIDR range
              </p>
            </div>
            {intel.isp && (
              <Link
                href={`/providers/${encodeURIComponent(intel.isp)}`}
                className="text-xs font-mono text-zinc-400 hover:text-white transition flex items-center gap-1"
              >
                <span>Browse All {intel.isp} Threats →</span>
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {relatedIps.map((rel: IntelRow) => {
              const relScore = rel.abuse_score ?? 0;
              const isRelHigh = relScore >= 75;
              return (
                <Link
                  key={rel.ip}
                  href={`/ip/${encodeURIComponent(rel.ip)}`}
                  className="rounded-lg border border-white/[0.06] bg-[#141824] p-3 hover:border-white/[0.18] transition group space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-zinc-200 group-hover:text-white group-hover:underline">
                      {rel.ip}
                    </span>
                    <span className="rounded bg-white/[0.06] px-1 py-0.2 text-[10px] font-mono text-zinc-400 border border-white/[0.08]">
                      {rel.country_code || 'XX'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 font-sans">
                    <span>Alerts: {rel.total_alert_count}</span>
                    <span className={`font-mono font-medium ${isRelHigh ? 'text-red-400' : 'text-zinc-300'}`}>
                      Score: {rel.abuse_score ?? 0}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
