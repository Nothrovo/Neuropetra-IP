'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Search,
  Upload,
  Download,
  Copy,
  Check,
  Database,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Activity,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  MinusSquare,
  Eye,
  X,
  RefreshCw,
  Key,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { isValidIP, defang, isPrivateIp } from '@/lib/ip-validator';
import {
  BulkIpItem,
  formatAlphaIocMarkdown,
  formatCharlieIocMarkdown,
  CharlieIocFormatOptions,
  getFullCountryName
} from '@/lib/charlie-ioc-formatter';
import { EnrichedIpResult } from '../api/enrich/route';

type SortField = 'score' | 'ip' | 'reports' | 'country' | 'status' | 'isp';
type SortOrder = 'asc' | 'desc';
type CategoryFilter = 'all' | 'malicious' | 'suspicious' | 'clean' | 'saved' | 'cached';

export default function LiveEnrichPage() {
  const [inputText, setInputText] = useState('');
  const [checkCacheFirst, setCheckCacheFirst] = useState(true);
  const [customApiKey, setCustomApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<{ current: number; total: number; currentIp: string } | null>(null);

  const [results, setResults] = useState<EnrichedIpResult[]>([]);
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
  const [defangAll, setDefangAll] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Filtering
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Copy feedbacks
  const [copiedIoc, setCopiedIoc] = useState(false);
  const [copiedIps, setCopiedIps] = useState(false);
  const [copiedSingleIp, setCopiedSingleIp] = useState<string | null>(null);
  const [showIocPreview, setShowIocPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extract valid IPs from current input text
  const detectedIps = useMemo(() => {
    if (!inputText.trim()) return [];
    const tokens = inputText.split(/[\r\n,\s;]+/).map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set(tokens.filter(isValidIP)));
  }, [inputText]);

  // Bulk execution with chunking for smooth progress updates
  async function handleEnrich(e: React.FormEvent) {
    e.preventDefault();
    if (detectedIps.length === 0) {
      setError('Please enter at least one valid IPv4 or IPv6 address.');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);
    setSelectedIps(new Set());

    const total = detectedIps.length;
    const chunkSize = 5;
    const allResults: EnrichedIpResult[] = [];

    try {
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = detectedIps.slice(i, i + chunkSize);
        setProgress({
          current: Math.min(i + chunk.length, total),
          total,
          currentIp: chunk[0],
        });

        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ips: chunk,
            checkCacheFirst,
            apiKey: customApiKey.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Enrichment request failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (Array.isArray(data.results)) {
          allResults.push(...data.results);
          // Incrementally update UI so user sees live results streaming in
          setResults([...allResults]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during enrichment.');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setInputText(content);
      }
    };
    reader.readAsText(file);
  }

  function handleLoadSample() {
    const sample = [
      '195.201.245.94',
      '98.86.120.236',
      '18.212.115.217',
      '44.202.42.125',
      '1.1.1.1',
      '8.8.8.8',
      '192.168.1.50',
    ].join('\n');
    setInputText(sample);
  }

  // Summary counts
  const counts = useMemo(() => {
    let malicious = 0;
    let suspicious = 0;
    let clean = 0;
    let saved = 0;
    let cached = 0;

    for (const r of results) {
      const score = r.abuseScore ?? 0;
      if (score >= 70) malicious++;
      else if (score >= 20) suspicious++;
      else clean++;

      if (r.savedToDb && r.source === 'abuseipdb_live') saved++;
      if (r.source === 'cache') cached++;
    }

    return {
      total: results.length,
      malicious,
      suspicious,
      clean,
      saved,
      cached,
    };
  }, [results]);

  // Filtered and sorted results
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      // Category filter
      if (categoryFilter === 'malicious' && (item.abuseScore ?? 0) < 70) return false;
      if (categoryFilter === 'suspicious') {
        const sc = item.abuseScore ?? 0;
        if (sc < 20 || sc >= 70) return false;
      }
      if (categoryFilter === 'clean' && (item.abuseScore ?? 0) !== 0) return false;
      if (categoryFilter === 'saved' && (!item.savedToDb || item.source !== 'abuseipdb_live')) return false;
      if (categoryFilter === 'cached' && item.source !== 'cache') return false;

      // Text search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesIp = item.ip.toLowerCase().includes(q);
        const matchesIsp = (item.isp || '').toLowerCase().includes(q);
        const matchesCountry = (item.countryName || item.countryCode || '').toLowerCase().includes(q);
        const matchesDomain = (item.domain || '').toLowerCase().includes(q);
        if (!matchesIp && !matchesIsp && !matchesCountry && !matchesDomain) return false;
      }

      return true;
    });
  }, [results, categoryFilter, searchQuery]);

  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === 'score') {
        valA = a.abuseScore ?? -1;
        valB = b.abuseScore ?? -1;
      } else if (sortField === 'reports') {
        valA = a.totalReports || 0;
        valB = b.totalReports || 0;
      } else if (sortField === 'ip') {
        return sortOrder === 'asc' ? a.ip.localeCompare(b.ip) : b.ip.localeCompare(a.ip);
      } else if (sortField === 'country') {
        valA = a.countryCode || '';
        valB = b.countryCode || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === 'isp') {
        valA = a.isp || '';
        valB = b.isp || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === 'status') {
        valA = a.source;
        valB = b.source;
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (sortOrder === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      }
    });
  }, [filteredResults, sortField, sortOrder]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  // Row selection helpers
  const allFilteredSelected = useMemo(() => {
    if (sortedResults.length === 0) return false;
    return sortedResults.every((r) => selectedIps.has(r.ip));
  }, [sortedResults, selectedIps]);

  const someFilteredSelected = useMemo(() => {
    return sortedResults.some((r) => selectedIps.has(r.ip)) && !allFilteredSelected;
  }, [sortedResults, selectedIps, allFilteredSelected]);

  function handleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selectedIps);
      sortedResults.forEach((r) => next.delete(r.ip));
      setSelectedIps(next);
    } else {
      const next = new Set(selectedIps);
      sortedResults.forEach((r) => next.add(r.ip));
      setSelectedIps(next);
    }
  }

  function toggleSelectIp(ip: string) {
    const next = new Set(selectedIps);
    if (next.has(ip)) next.delete(ip);
    else next.add(ip);
    setSelectedIps(next);
  }

  // Convert EnrichedIpResult to BulkIpItem for Alpha Reporter IoC formatter
  const formattedIocMarkdown = useMemo(() => {
    const targetList = selectedIps.size > 0
      ? results.filter((r) => selectedIps.has(r.ip))
      : results;

    const bulkItems: BulkIpItem[] = targetList.map((r) => ({
      ip: r.ip,
      found: true,
      verdict: r.verdict,
      compositeScore: r.compositeScore,
      countryCode: r.countryCode || undefined,
      countryName: r.countryName,
      isp: r.isp,
      asn: r.isp,
      totalAlertCount: 1,
      abuseScore: r.abuseScore,
      reputationSource: 'abuseipdb',
    }));

    return formatAlphaIocMarkdown(bulkItems, {
      includeSectionHeader: true,
      includeHashRow: true,
      includeFootnote: true,
      includeActivityContext: false,
    });
  }, [results, selectedIps]);

  function copyToClipboard(text: string, type: 'ioc' | 'ips') {
    navigator.clipboard.writeText(text);
    if (type === 'ioc') {
      setCopiedIoc(true);
      setTimeout(() => setCopiedIoc(false), 2000);
    } else {
      setCopiedIps(true);
      setTimeout(() => setCopiedIps(false), 2000);
    }
  }

  function copySingle(text: string, ip: string) {
    navigator.clipboard.writeText(text);
    setCopiedSingleIp(ip);
    setTimeout(() => setCopiedSingleIp(null), 1500);
  }

  function handleExportCsv() {
    const list = selectedIps.size > 0 ? results.filter((r) => selectedIps.has(r.ip)) : results;
    if (list.length === 0) return;

    const headers = [
      'IP Address',
      'Verdict',
      'Abuse Confidence Score',
      'Total Reports',
      'Distinct Reporters',
      'Country Code',
      'Country Name',
      'ISP',
      'Domain',
      'Usage Type',
      'Reputation Source',
      'Saved To Database',
      'Checked At',
    ];

    const rows = list.map((r) => [
      r.ip,
      r.verdict,
      r.abuseScore !== null ? `${r.abuseScore}%` : 'N/A',
      r.totalReports,
      r.numDistinctUsers,
      r.countryCode || 'N/A',
      `"${(r.countryName || 'Unknown').replace(/"/g, '""')}"`,
      `"${(r.isp || 'Unknown').replace(/"/g, '""')}"`,
      `"${(r.domain || 'N/A').replace(/"/g, '""')}"`,
      `"${(r.usageType || 'N/A').replace(/"/g, '""')}"`,
      r.source,
      r.savedToDb ? 'YES' : 'NO',
      r.checkedAt,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `abuseipdb_enrichment_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      {/* Top Banner & Mode Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              Deep Threat Intelligence Enrichment
            </h1>
            <span className="rounded bg-amber-950/40 px-2 py-0.5 text-[10px] font-mono text-amber-300 border border-amber-800/40">
              Live Provider Mode
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl">
            Query single or bulk IP indicators against live threat APIs (AbuseIPDB/VT) with automatic PostgreSQL caching and IoC generation.
          </p>
        </div>

        {/* Investigation Mode Toggle */}
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#0e111a] p-1 text-xs font-mono self-start md:self-auto">
          <Link
            href="/bulk"
            className="rounded-md text-zinc-400 hover:text-zinc-200 px-3 py-1 transition flex items-center gap-1"
          >
            <span>⚡ Local DB Cache</span>
          </Link>
          <span className="rounded-md bg-white/[0.12] text-white px-3 py-1 font-semibold shadow-sm flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span>🌐 Deep Live Enrich</span>
          </span>
        </div>
      </div>

      {/* Main Input Form Card */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 shadow-sm space-y-4">
        <form onSubmit={handleEnrich} className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-200 flex items-center gap-2">
              <Search className="h-4 w-4 text-zinc-400" />
              <span>IP Indicators (Single or Bulk)</span>
              {detectedIps.length > 0 && (
                <span className="rounded-full bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-[11px] font-mono text-zinc-300">
                  {detectedIps.length} {detectedIps.length === 1 ? 'indicator' : 'indicators'} detected
                </span>
              )}
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-xs font-mono text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                Load Sample
              </button>
              <span className="text-zinc-700">|</span>
              <button
                type="button"
                onClick={() => setInputText('')}
                className="text-xs font-mono text-zinc-400 hover:text-red-400 transition cursor-pointer"
              >
                Clear
              </button>
              <span className="text-zinc-700">|</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              >
                <Upload className="h-3 w-3" />
                Upload File
              </button>
            </div>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={4}
            placeholder="Paste 1 IP or multiple IPs here (separated by newlines, spaces, or commas)&#10;e.g.&#10;195.201.245.94&#10;98.86.120.236&#10;18.212.115.217"
            className="w-full rounded-lg border border-white/[0.1] bg-[#141824] p-3 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none focus:ring-1 focus:ring-white/[0.15] transition"
          />

          {/* Options Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-4">
              {/* Check Cache First Toggle */}
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkCacheFirst}
                  onChange={(e) => setCheckCacheFirst(e.target.checked)}
                  className="rounded border-white/[0.15] bg-[#141824] text-zinc-200 focus:ring-0 accent-zinc-300"
                />
                <span className="flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-zinc-400" />
                  Check DB Cache First
                </span>
                <span className="text-[11px] text-zinc-500 hidden sm:inline">(Saves API quota if already cached)</span>
              </label>

              {/* Custom API Key Accordion Button */}
              <button
                type="button"
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer font-mono"
              >
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span>Custom API Key</span>
                {showKeyInput ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {/* Submit Action Button */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={loading || detectedIps.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white border border-white/[0.12] px-5 py-2 text-xs font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Enriching Indicators...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>Lookup & Enrich ({detectedIps.length || 0})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Expandable Custom API Key Input */}
          {showKeyInput && (
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" /> AbuseIPDB API Key (Optional Override)
                </span>
                <span className="text-[10px] text-amber-400/80 font-mono">
                  Default: Server Pre-configured Key
                </span>
              </div>
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="Leave blank to use default server key (configured server key)"
                className="w-full rounded border border-slate-700 bg-slate-900/90 px-3 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400">
                If provided, requests will authenticate using your personal AbuseIPDB key instead of the shared server key.
              </p>
            </div>
          )}

          {/* Live Progress Bar */}
          {loading && progress && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-400 flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Querying indicator: <span className="text-slate-200 font-semibold">{progress.currentIp}</span>
                </span>
                <span className="text-slate-400">
                  {progress.current} of {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      </div>

      {/* Summary Metrics Cards */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Total Queried</span>
            <span className="text-xl font-bold font-mono text-slate-100 mt-1 block">{counts.total}</span>
          </div>

          <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-3.5 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-red-400 uppercase tracking-wider block flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Malicious (≥70%)
            </span>
            <span className="text-xl font-bold font-mono text-red-400 mt-1 block">{counts.malicious}</span>
          </div>

          <div className="rounded-xl border border-amber-900/30 bg-amber-950/10 p-3.5 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider block flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Suspicious (20-69%)
            </span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">{counts.suspicious}</span>
          </div>

          <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-3.5 backdrop-blur-sm">
            <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Clean (0%)
            </span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">{counts.clean}</span>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-3.5">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block flex items-center gap-1">
              <Database className="h-3 w-3" /> Saved to DB
            </span>
            <span className="text-xl font-bold font-mono text-zinc-100 mt-1 block font-tabular">{counts.saved}</span>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-3.5">
            <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Cache Hits
            </span>
            <span className="text-xl font-bold font-mono text-zinc-100 mt-1 block font-tabular">{counts.cached}</span>
          </div>
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] shadow-sm overflow-hidden">
          {/* Action Toolbar & Filters */}
          <div className="border-b border-white/[0.06] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 font-mono">
            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                  categoryFilter === 'all'
                    ? 'bg-white/[0.12] text-white border border-white/[0.12]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                All ({counts.total})
              </button>
              <button
                onClick={() => setCategoryFilter('malicious')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                  categoryFilter === 'malicious'
                    ? 'bg-red-950/80 text-red-300 border border-red-800'
                    : 'text-zinc-400 hover:text-red-400 hover:bg-white/[0.04]'
                }`}
              >
                Malicious ({counts.malicious})
              </button>
              <button
                onClick={() => setCategoryFilter('suspicious')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                  categoryFilter === 'suspicious'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                    : 'text-zinc-400 hover:text-amber-400 hover:bg-white/[0.04]'
                }`}
              >
                Suspicious ({counts.suspicious})
              </button>
              <button
                onClick={() => setCategoryFilter('clean')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                  categoryFilter === 'clean'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    : 'text-zinc-400 hover:text-emerald-400 hover:bg-white/[0.04]'
                }`}
              >
                Clean ({counts.clean})
              </button>
              <button
                onClick={() => setCategoryFilter('saved')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                  categoryFilter === 'saved'
                    ? 'bg-white/[0.12] text-white border border-white/[0.12]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                New Saved ({counts.saved})
              </button>
              <button
                onClick={() => setCategoryFilter('cached')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                  categoryFilter === 'cached'
                    ? 'bg-white/[0.12] text-white border border-white/[0.12]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                Cached ({counts.cached})
              </button>
            </div>

            {/* Actions Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search Filter */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter results..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md border border-white/[0.08] bg-[#141824] py-1 pl-8 pr-2.5 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none"
                />
              </div>

              {/* Defang All Toggle */}
              <button
                onClick={() => setDefangAll(!defangAll)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition cursor-pointer border ${
                  defangAll
                    ? 'border-white/[0.2] bg-white/[0.1] text-white'
                    : 'border-white/[0.08] bg-[#141824] text-zinc-400 hover:text-zinc-200'
                }`}
                title="Toggle defanged display for all IPs"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                <span>Defang [.]</span>
              </button>

              {/* Copy Alpha Reporter IoC */}
              <button
                onClick={() => copyToClipboard(formattedIocMarkdown, 'ioc')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-white/[0.12] hover:bg-white/[0.18] text-white border border-white/[0.12] shadow-sm transition cursor-pointer"
                title="Copy markdown table for Alpha Reporter incident report"
              >
                {copiedIoc ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                    <span>Copied IoC (.md)</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-3.5 w-3.5" />
                    <span>Copy IoC (.md) {selectedIps.size > 0 && `(${selectedIps.size})`}</span>
                  </>
                )}
              </button>

              {/* Export CSV */}
              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border border-white/[0.08] bg-[#141824] hover:bg-white/[0.06] text-zinc-200 transition cursor-pointer"
                title="Download CSV report"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
                <span>Export CSV</span>
              </button>

              {/* Preview Modal Button */}
              <button
                onClick={() => setShowIocPreview(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border border-white/[0.08] bg-[#141824] hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                title="Preview IoC Markdown"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Preview</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] bg-[#141824] font-mono text-[11px] text-zinc-400 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="cursor-pointer text-zinc-400 hover:text-white transition"
                      title={allFilteredSelected ? 'Deselect all' : 'Select all'}
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="h-4 w-4 text-white" />
                      ) : someFilteredSelected ? (
                        <MinusSquare className="h-4 w-4 text-zinc-300" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3">
                    <button
                      onClick={() => toggleSort('ip')}
                      className="inline-flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer"
                    >
                      <span>Indicator / IP</span>
                      {sortField === 'ip' ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-300" /> : <ArrowDown className="h-3 w-3 text-zinc-300" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3">
                    <button
                      onClick={() => toggleSort('score')}
                      className="inline-flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer"
                    >
                      <span>Abuse Score / Verdict</span>
                      {sortField === 'score' ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-300" /> : <ArrowDown className="h-3 w-3 text-zinc-300" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3">
                    <button
                      onClick={() => toggleSort('reports')}
                      className="inline-flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer"
                    >
                      <span>Reports</span>
                      {sortField === 'reports' ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-300" /> : <ArrowDown className="h-3 w-3 text-zinc-300" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3">
                    <button
                      onClick={() => toggleSort('country')}
                      className="inline-flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer"
                    >
                      <span>Country</span>
                      {sortField === 'country' ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-300" /> : <ArrowDown className="h-3 w-3 text-zinc-300" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3">
                    <button
                      onClick={() => toggleSort('isp')}
                      className="inline-flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer"
                    >
                      <span>ISP / Domain</span>
                      {sortField === 'isp' ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-300" /> : <ArrowDown className="h-3 w-3 text-zinc-300" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3">
                    <button
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-1 hover:text-zinc-200 transition cursor-pointer"
                    >
                      <span>Status & DB</span>
                      {sortField === 'status' ? (
                        sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 text-zinc-300" /> : <ArrowDown className="h-3 w-3 text-zinc-300" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  </th>

                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] font-sans">
                {sortedResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500 font-mono text-xs">
                      No indicators match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  sortedResults.map((item) => {
                    const isSelected = selectedIps.has(item.ip);
                    const displayIp = defangAll ? defang(item.ip) : item.ip;
                    const score = item.abuseScore ?? 0;

                    let badgeColor = 'bg-white/[0.06] text-zinc-300 border-white/[0.08]';
                    let barColor = 'bg-zinc-600';
                    if (score >= 70) {
                      badgeColor = 'bg-red-950/80 text-red-300 border-red-800/80';
                      barColor = 'bg-red-500';
                    } else if (score >= 20) {
                      badgeColor = 'bg-amber-950/80 text-amber-300 border-amber-800/80';
                      barColor = 'bg-amber-500';
                    } else if (score === 0) {
                      badgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80';
                      barColor = 'bg-emerald-500';
                    } else {
                      badgeColor = 'bg-sky-950/80 text-sky-300 border-sky-800/80';
                      barColor = 'bg-sky-500';
                    }

                    return (
                      <tr
                        key={item.ip}
                        className={`transition hover:bg-white/[0.03] ${
                          isSelected ? 'bg-white/[0.06]' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectIp(item.ip)}
                            className="cursor-pointer text-zinc-400 hover:text-white transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-white" />
                            ) : (
                              <Square className="h-4 w-4 text-zinc-600 hover:text-zinc-400" />
                            )}
                          </button>
                        </td>

                        {/* IP Indicator */}
                        <td className="py-3 px-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/ip/${encodeURIComponent(item.ip)}`}
                              className="font-semibold text-zinc-200 hover:text-white hover:underline transition"
                              title="View deep-dive SOC details"
                            >
                              {displayIp}
                            </Link>
                            {item.isTor && (
                              <span className="rounded bg-purple-950 px-1 py-0.5 text-[10px] font-mono text-purple-400 border border-purple-800">
                                TOR
                              </span>
                            )}
                            {item.isWhitelisted && (
                              <span className="rounded bg-emerald-950 px-1 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-800">
                                Whitelist
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Score & Verdict */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-1 w-36">
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                {item.abuseScore !== null ? `${item.abuseScore}%` : 'N/A'} {item.verdict}
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full ${barColor}`}
                                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Reports */}
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {item.totalReports > 0 ? (
                            <div>
                              <span>{item.totalReports}</span>
                              <span className="text-slate-500 text-[10px] block">
                                by {item.numDistinctUsers} users
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500">0 reports</span>
                          )}
                        </td>

                        {/* Country */}
                        <td className="py-3 px-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            {item.countryCode && item.countryCode !== 'LAN' && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-bold border border-slate-700">
                                {item.countryCode}
                              </span>
                            )}
                            <span className="text-slate-300 text-xs truncate max-w-[120px]" title={item.countryName || 'Unknown'}>
                              {item.countryName || 'Unknown'}
                            </span>
                          </div>
                        </td>

                        {/* ISP & Domain */}
                        <td className="py-3 px-3">
                          <div className="max-w-[200px] truncate" title={item.isp || 'Unknown'}>
                            <span className="text-slate-200 text-xs font-medium block truncate">
                              {item.isp || 'Unknown'}
                            </span>
                            {item.domain && (
                              <span className="text-slate-500 text-[10px] font-mono block truncate">
                                {item.domain}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status & DB */}
                        <td className="py-3 px-3 font-mono text-[11px]">
                          {item.source === 'cache' ? (
                            <span className="inline-flex items-center gap-1 text-zinc-300 bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded">
                              <Database className="h-3 w-3 text-zinc-400" /> Cache Hit
                            </span>
                          ) : item.savedToDb ? (
                            <span className="inline-flex items-center gap-1 text-purple-300 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded">
                              <CheckCircle2 className="h-3 w-3 text-purple-400" /> Saved to DB
                            </span>
                          ) : item.source === 'local_private' ? (
                            <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              RFC1918 Private
                            </span>
                          ) : item.status === 'rate_limited' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                              <AlertTriangle className="h-3 w-3" /> Rate Limited
                            </span>
                          ) : item.status === 'error' ? (
                            <span className="inline-flex items-center gap-1 text-red-400 bg-red-950/60 border border-red-800/60 px-2 py-0.5 rounded" title={item.error || 'Error'}>
                              Lookup Error
                            </span>
                          ) : (
                            <span className="text-slate-500">Uncached</span>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1 font-mono">
                            <button
                              onClick={() => copySingle(item.ip, item.ip)}
                              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
                              title="Copy raw IP"
                            >
                              {copiedSingleIp === item.ip ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>

                            <Link
                              href={`/ip/${encodeURIComponent(item.ip)}`}
                              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
                              title="Open detail page"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IoC Markdown Preview Modal */}
      {showIocPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
          <div className="w-full max-w-4xl rounded-xl border border-white/[0.08] bg-[#0e111a] shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
              <div className="flex items-center gap-2 text-zinc-100 font-mono text-sm">
                <FileText className="h-4 w-4 text-zinc-400" />
                <span>Alpha Reporter IoC Markdown Preview</span>
              </div>
              <button
                onClick={() => setShowIocPreview(false)}
                className="rounded p-1 text-zinc-400 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto font-mono text-xs text-zinc-200 bg-[#141824] m-4 rounded-lg border border-white/[0.06] whitespace-pre">
              {formattedIocMarkdown}
            </div>

            <div className="border-t border-white/[0.06] p-4 flex items-center justify-between font-sans">
              <span className="text-xs text-zinc-400 font-mono">
                {selectedIps.size > 0
                  ? `Showing ${selectedIps.size} selected indicators`
                  : `Showing all ${results.length} indicators`}
              </span>
              <div className="flex items-center gap-2 font-mono">
                <button
                  onClick={() => copyToClipboard(formattedIocMarkdown, 'ioc')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] border border-white/[0.12] text-xs font-semibold text-white transition cursor-pointer shadow-sm"
                >
                  {copiedIoc ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedIoc ? 'Copied to Clipboard!' : 'Copy Markdown'}</span>
                </button>
                <button
                  onClick={() => setShowIocPreview(false)}
                  className="px-4 py-2 rounded-lg bg-[#141824] hover:bg-white/[0.06] border border-white/[0.08] text-xs text-zinc-300 hover:text-white transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
