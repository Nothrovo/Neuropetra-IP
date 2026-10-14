'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Layers,
  Upload,
  Download,
  Search,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Eye,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  MinusSquare,
  Filter,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import DefangButton from '@/components/DefangButton';
import {
  BulkIpItem,
  CharlieIocFormatOptions,
  formatCharlieIocMarkdown,
  formatAlphaIocMarkdown,
  formatSingleIocRow,
} from '@/lib/charlie-ioc-formatter';

type SortField = 'score' | 'ip' | 'verdict' | 'country' | 'alerts' | 'attack';
type SortOrder = 'asc' | 'desc';
type CategoryFilter = 'all' | 'malicious' | 'suspicious' | 'low_risk' | 'clean' | 'not_enriched';

export default function BulkLookupPage() {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<BulkIpItem[]>([]);
  const [copiedIoc, setCopiedIoc] = useState(false);
  const [copiedRowIp, setCopiedRowIp] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Category and search filter
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Row selection state
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
  const [copiedSelectedIoc, setCopiedSelectedIoc] = useState(false);
  const [copiedSelectedIpsList, setCopiedSelectedIpsList] = useState(false);
  const [copiedSelectedDefanged, setCopiedSelectedDefanged] = useState(false);

  // Markdown format options
  const [iocOptions, setIocOptions] = useState<CharlieIocFormatOptions>({
    includeSectionHeader: true,
    includeHashRow: true,
    includeFootnote: true,
    includeActivityContext: true,
    reportVariant: 'alpha',
  });
  const [previewScope, setPreviewScope] = useState<'all' | 'selected'>('all');

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process bulk lookup');

      setResults(data.results || []);
      setSelectedIps(new Set()); // Reset selection on new batch lookup
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  // --- Category Counting ---
  const counts = useMemo(() => {
    let malicious = 0;
    let suspicious = 0;
    let lowRisk = 0;
    let clean = 0;
    let notEnriched = 0;

    for (const r of results) {
      const score = r.compositeScore ?? 0;
      const isUnknown = r.found === false || r.verdict === 'Unknown' || r.compositeScore == null;
      if (isUnknown) {
        notEnriched++;
      } else if (r.verdict === 'Malicious' || score >= 70) {
        malicious++;
      } else if (r.verdict === 'Suspicious' || (score >= 20 && score < 70)) {
        suspicious++;
      } else if (score === 0) {
        clean++;
      } else if (r.verdict === 'Low risk' || (score > 0 && score < 20)) {
        lowRisk++;
      }
    }

    return {
      all: results.length,
      malicious,
      suspicious,
      lowRisk,
      clean,
      notEnriched,
    };
  }, [results]);

  // --- IP Natural Sorting Helper ---
  function compareIps(ipA: string, ipB: string): number {
    const octetsA = ipA.split('.').map(Number);
    const octetsB = ipB.split('.').map(Number);
    if (octetsA.length === 4 && octetsB.length === 4 && !octetsA.some(isNaN) && !octetsB.some(isNaN)) {
      for (let i = 0; i < 4; i++) {
        if (octetsA[i] !== octetsB[i]) return octetsA[i] - octetsB[i];
      }
      return 0;
    }
    return ipA.localeCompare(ipB);
  }

  function getVerdictRank(verdict?: string, score?: number): number {
    if (verdict === 'Malicious' || (score ?? 0) >= 70) return 4;
    if (verdict === 'Suspicious' || ((score ?? 0) >= 20 && (score ?? 0) < 70)) return 3;
    if (verdict === 'Low risk' || ((score ?? 0) > 0 && (score ?? 0) < 20)) return 2;
    if (score === 0) return 1;
    return 0;
  }

  // --- Filtered and Sorted Results ---
  const filteredAndSortedResults = useMemo(() => {
    // 1. Filter by category
    let list = results.filter((r) => {
      const score = r.compositeScore ?? 0;
      const isUnknown = r.found === false || r.verdict === 'Unknown' || r.compositeScore == null;
      if (categoryFilter === 'malicious') return r.verdict === 'Malicious' || score >= 70;
      if (categoryFilter === 'suspicious') return r.verdict === 'Suspicious' || (score >= 20 && score < 70);
      if (categoryFilter === 'low_risk') return r.verdict === 'Low risk' || (score > 0 && score < 20);
      if (categoryFilter === 'clean') return score === 0 && !isUnknown;
      if (categoryFilter === 'not_enriched') return isUnknown;
      return true;
    });

    // 2. Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) =>
        r.ip.toLowerCase().includes(q) ||
        (r.isp && r.isp.toLowerCase().includes(q)) ||
        (r.countryCode && r.countryCode.toLowerCase().includes(q)) ||
        (r.countryName && r.countryName.toLowerCase().includes(q)) ||
        (r.topAttackType && r.topAttackType.toLowerCase().includes(q)) ||
        (r.verdict && r.verdict.toLowerCase().includes(q))
      );
    }

    // 3. Sort
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'ip') {
        cmp = compareIps(a.ip, b.ip);
      } else if (sortField === 'score') {
        cmp = (a.compositeScore ?? 0) - (b.compositeScore ?? 0);
      } else if (sortField === 'verdict') {
        cmp = getVerdictRank(a.verdict, a.compositeScore) - getVerdictRank(b.verdict, b.compositeScore);
      } else if (sortField === 'country') {
        const countryA = a.countryCode || '';
        const countryB = b.countryCode || '';
        cmp = countryA.localeCompare(countryB);
      } else if (sortField === 'alerts') {
        cmp = (a.totalAlertCount || 0) - (b.totalAlertCount || 0);
      } else if (sortField === 'attack') {
        cmp = (a.topAttackType || '').localeCompare(b.topAttackType || '');
      }

      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }, [results, categoryFilter, searchQuery, sortField, sortOrder]);

  // Selected items preserving current table ordering
  const selectedItems = useMemo(() => {
    if (selectedIps.size === 0) return [];
    return filteredAndSortedResults.filter((r) => selectedIps.has(r.ip));
  }, [filteredAndSortedResults, selectedIps]);

  // --- Sorting Handler ---
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  function renderSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-slate-600 group-hover:text-slate-400 transition ml-1 inline-block" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-cyan-400 ml-1 inline-block" />
    ) : (
      <ArrowDown className="h-3 w-3 text-cyan-400 ml-1 inline-block" />
    );
  }

  // --- Selection Handlers ---
  function handleToggleSelectAllFiltered() {
    const allSelected =
      filteredAndSortedResults.length > 0 &&
      filteredAndSortedResults.every((r) => selectedIps.has(r.ip));

    const next = new Set(selectedIps);
    if (allSelected) {
      filteredAndSortedResults.forEach((r) => next.delete(r.ip));
    } else {
      filteredAndSortedResults.forEach((r) => next.add(r.ip));
    }
    setSelectedIps(next);
  }

  function handleToggleRowSelect(ip: string) {
    const next = new Set(selectedIps);
    if (next.has(ip)) {
      next.delete(ip);
    } else {
      next.add(ip);
    }
    setSelectedIps(next);
  }

  function handleQuickSelectPreset(preset: 'malicious' | 'suspicious' | 'not_enriched' | 'all') {
    const next = new Set(selectedIps);
    for (const r of results) {
      const score = r.compositeScore ?? 0;
      const isUnknown = r.found === false || r.verdict === 'Unknown' || r.compositeScore == null;
      let match = false;
      if (preset === 'all') match = true;
      else if (preset === 'malicious') match = r.verdict === 'Malicious' || score >= 70;
      else if (preset === 'suspicious') match = r.verdict === 'Suspicious' || (score >= 20 && score < 70);
      else if (preset === 'not_enriched') match = isUnknown;

      if (match) next.add(r.ip);
    }
    setSelectedIps(next);
  }

  function handleClearSelection() {
    setSelectedIps(new Set());
  }

  // --- Export & Copy Actions ---
  function handleCopyAlphaIoc(itemsToCopy?: BulkIpItem[]) {
    const target = itemsToCopy || (selectedItems.length > 0 ? selectedItems : results);
    if (target.length === 0) return;

    const md = formatAlphaIocMarkdown(target, iocOptions);
    navigator.clipboard.writeText(md);

    if (itemsToCopy || selectedItems.length > 0) {
      setCopiedSelectedIoc(true);
      setTimeout(() => setCopiedSelectedIoc(false), 2000);
    } else {
      setCopiedIoc(true);
      setTimeout(() => setCopiedIoc(false), 2000);
    }
  }

  function handleDownloadAlphaIoc(itemsToDownload?: BulkIpItem[]) {
    const target = itemsToDownload || (selectedItems.length > 0 ? selectedItems : results);
    if (target.length === 0) return;

    const md = formatAlphaIocMarkdown(target, iocOptions);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alpha_reporter_ioc_${target.length}ips_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportCsv(itemsToExport?: BulkIpItem[]) {
    const target = itemsToExport || (selectedItems.length > 0 ? selectedItems : results);
    if (target.length === 0) return;

    const headers = 'ip,found,verdict,score,country,isp,total_alerts,top_attack,last_seen\n';
    const rows = target.map(
      (r) =>
        `"${r.ip}",${r.found},"${r.verdict}",${r.compositeScore},"${r.countryCode}","${r.isp || 'N/A'}",${r.totalAlertCount},"${r.topAttackType}","${r.lastSeen || 'N/A'}"`
    );
    const blob = new Blob([headers + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_intel_export_${target.length}ips_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyRawIpsList(defanged = false) {
    const target = selectedItems.length > 0 ? selectedItems : results;
    if (target.length === 0) return;

    const text = target
      .map((r) => (defanged ? r.ip.replace(/\./g, '[.]') : r.ip))
      .join('\n');
    navigator.clipboard.writeText(text);

    if (defanged) {
      setCopiedSelectedDefanged(true);
      setTimeout(() => setCopiedSelectedDefanged(false), 2000);
    } else {
      setCopiedSelectedIpsList(true);
      setTimeout(() => setCopiedSelectedIpsList(false), 2000);
    }
  }

  function handleCopyRowMarkdown(item: BulkIpItem) {
    const rowMd = formatSingleIocRow(item, {
      includeActivityContext: iocOptions.includeActivityContext,
    });
    navigator.clipboard.writeText(rowMd);
    setCopiedRowIp(item.ip);
    setTimeout(() => setCopiedRowIp(null), 2000);
  }

  // Preview content based on previewScope
  const activePreviewItems =
    previewScope === 'selected' && selectedItems.length > 0 ? selectedItems : results;
  const previewMarkdownContent =
    iocOptions.reportVariant === 'alpha'
      ? formatAlphaIocMarkdown(activePreviewItems, iocOptions)
      : formatCharlieIocMarkdown(activePreviewItems, iocOptions);

  const isAllFilteredSelected =
    filteredAndSortedResults.length > 0 &&
    filteredAndSortedResults.every((r) => selectedIps.has(r.ip));

  const isSomeFilteredSelected =
    filteredAndSortedResults.some((r) => selectedIps.has(r.ip)) && !isAllFilteredSelected;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6 font-sans">
      {/* Mode Switcher & Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              Batch IP Threat Investigation
            </h1>
            <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
              Local DB Mode
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Query multiple IP indicators against PostgreSQL cache and generate standardized Alpha/Charlie IoC reports.
          </p>
        </div>

        {/* Investigation Mode Toggle */}
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#0e111a] p-1 text-xs font-mono self-start md:self-auto">
          <span className="rounded-md bg-white/[0.12] text-white px-3 py-1 font-semibold shadow-sm">
            ⚡ Local DB Cache
          </span>
          <Link
            href="/enrich"
            className="rounded-md text-zinc-400 hover:text-zinc-200 px-3 py-1 transition flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3 text-amber-400" />
            <span>Deep Live Enrich →</span>
          </Link>
        </div>
      </div>

      {/* Input Section */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4 shadow-sm">
        <form onSubmit={handleLookup} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2 text-xs font-sans">
              <label className="font-medium text-zinc-300">
                Enter IPs (separated by newlines or commas, max 200)
              </label>
              <label className="cursor-pointer text-zinc-400 hover:text-white flex items-center gap-1.5 transition">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload CSV / TXT</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <textarea
              rows={5}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="185.220.101.5&#10;45.154.255.89&#10;194.26.29.112&#10;8.8.8.8"
              className="w-full rounded-lg border border-white/[0.1] bg-[#141824] p-3 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none focus:ring-1 focus:ring-white/[0.15] transition"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-zinc-500 font-mono">
              Duplicates and invalid IPs are automatically filtered
            </span>
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white border border-white/[0.12] px-5 py-2.5 text-xs font-semibold shadow-sm disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{loading ? 'Analyzing batch...' : 'Analyze Batch'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {results.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0e111a] p-5 space-y-4 shadow-sm">
          {/* Section Header & Primary Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.06] pb-4 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Batch Results</span>
                <span className="rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-mono text-zinc-300 border border-white/[0.08]">
                  {results.length} Evaluated
                </span>
                {selectedIps.size > 0 && (
                  <span className="rounded bg-white/[0.1] px-2 py-0.5 text-[10px] font-mono text-white border border-white/[0.15]">
                    {selectedIps.size} Selected
                  </span>
                )}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono">
              {/* Preview & Customize Modal Button */}
              <button
                onClick={() => {
                  setPreviewScope(selectedIps.size > 0 ? 'selected' : 'all');
                  setShowPreview(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141824] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white cursor-pointer transition"
                title="Preview and customize Alpha Reporter IoC Markdown"
              >
                <Eye className="h-3.5 w-3.5 text-zinc-400" />
                <span>Preview .md</span>
              </button>

              {/* Main Copy Alpha IoC .md Button */}
              <button
                onClick={() => handleCopyAlphaIoc()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#141824] px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.08] hover:text-white cursor-pointer transition shadow-sm"
                title="Copy all evaluated IoCs in official Alpha Reporter Section 2 format"
              >
                {copiedIoc ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied Alpha IoC (.md)!</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-3.5 w-3.5 text-zinc-400" />
                    <span>Copy Alpha IoC (.md)</span>
                  </>
                )}
              </button>

              {/* Export CSV Button */}
              <button
                onClick={() => handleExportCsv()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141824] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white cursor-pointer transition"
                title="Export all evaluated IPs to CSV"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Category Filter Chips & Quick Select Presets */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
              <span className="text-zinc-500 font-sans text-[11px] mr-1 flex items-center gap-1">
                <Filter className="h-3 w-3 text-zinc-500" />
                Filter:
              </span>

              {/* All */}
              <button
                onClick={() => setCategoryFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === 'all'
                    ? 'bg-white/[0.12] text-white font-semibold border border-white/[0.12]'
                    : 'bg-[#141824] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <span>All</span>
                <span className="text-[10px] opacity-80 font-sans">({counts.all})</span>
              </button>

              {/* Malicious */}
              <button
                onClick={() => setCategoryFilter('malicious')}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === 'malicious'
                    ? 'bg-red-700 text-white font-semibold shadow'
                    : 'bg-red-950/60 text-red-400 hover:bg-red-900/60 border border-red-900/40'
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                <span>Malicious</span>
                <span className="text-[10px] opacity-80 font-sans">({counts.malicious})</span>
              </button>

              {/* Suspicious */}
              <button
                onClick={() => setCategoryFilter('suspicious')}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === 'suspicious'
                    ? 'bg-amber-600 text-white font-semibold shadow'
                    : 'bg-amber-950/60 text-amber-400 hover:bg-amber-900/60 border border-amber-900/40'
                }`}
              >
                <ShieldQuestion className="h-3 w-3" />
                <span>Suspicious</span>
                <span className="text-[10px] opacity-80 font-sans">({counts.suspicious})</span>
              </button>

              {/* Low Risk */}
              <button
                onClick={() => setCategoryFilter('low_risk')}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === 'low_risk'
                    ? 'bg-emerald-600 text-white font-semibold shadow'
                    : 'bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-900/40'
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                <span>Low Risk</span>
                <span className="text-[10px] opacity-80 font-sans">({counts.lowRisk})</span>
              </button>

              {/* Clean */}
              <button
                onClick={() => setCategoryFilter('clean')}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === 'clean'
                    ? 'bg-slate-700 text-white font-semibold shadow'
                    : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                }`}
              >
                <span>Clean (0%)</span>
                <span className="text-[10px] opacity-80 font-sans">({counts.clean})</span>
              </button>

              {/* Not Enriched / Unknown */}
              <button
                onClick={() => setCategoryFilter('not_enriched')}
                className={`rounded-lg px-2.5 py-1 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
                  categoryFilter === 'not_enriched'
                    ? 'bg-purple-700 text-white font-semibold shadow'
                    : 'bg-purple-950/60 text-purple-400 hover:bg-purple-900/60 border border-purple-900/40'
                }`}
              >
                <HelpCircle className="h-3 w-3" />
                <span>Not Enriched</span>
                <span className="text-[10px] opacity-80 font-sans">({counts.notEnriched})</span>
              </button>
            </div>

            {/* Quick Search Box */}
            <div className="relative w-full md:w-64">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search IP, ISP, country..."
                className="w-full rounded-lg border border-white/[0.08] bg-[#141824] pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/[0.25] focus:outline-none focus:ring-1 focus:ring-white/[0.15] transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Select Presets Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs py-1 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center gap-1.5 font-mono">
              <span className="text-zinc-500 font-sans text-[11px] mr-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                Quick Select:
              </span>
              <button
                onClick={() => handleQuickSelectPreset('malicious')}
                className="rounded border border-red-800/60 bg-red-950/30 px-2 py-0.5 text-[11px] font-mono text-red-300 hover:bg-red-900/40 cursor-pointer transition"
              >
                + Select Malicious ({counts.malicious})
              </button>
              <button
                onClick={() => handleQuickSelectPreset('suspicious')}
                className="rounded border border-amber-800/60 bg-amber-950/30 px-2 py-0.5 text-[11px] font-mono text-amber-300 hover:bg-amber-900/40 cursor-pointer transition"
              >
                + Select Suspicious ({counts.suspicious})
              </button>
              <button
                onClick={() => handleQuickSelectPreset('not_enriched')}
                className="rounded border border-white/[0.08] bg-[#141824] px-2 py-0.5 text-[11px] font-mono text-zinc-300 hover:bg-white/[0.06] cursor-pointer transition"
              >
                + Select Not Enriched ({counts.notEnriched})
              </button>
              <button
                onClick={() => handleQuickSelectPreset('all')}
                className="rounded border border-white/[0.08] bg-[#141824] px-2 py-0.5 text-[11px] font-mono text-zinc-300 hover:bg-white/[0.06] cursor-pointer transition"
              >
                + Select All ({counts.all})
              </button>
            </div>

            {selectedIps.size > 0 && (
              <button
                onClick={handleClearSelection}
                className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                <span>Clear Selection ({selectedIps.size})</span>
              </button>
            )}
          </div>

          {/* DEDICATED SELECTION ACTION BAR (Visible when >= 1 row selected) */}
          {selectedIps.size > 0 && (
            <div className="rounded-xl border border-white/[0.12] bg-[#141824] p-3 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-white">
                  <CheckSquare className="h-3.5 w-3.5" />
                </span>
                <div>
                  <span className="text-xs font-semibold text-zinc-100 font-mono">
                    {selectedIps.size} IP(s) Selected
                  </span>
                  <span className="text-[11px] text-zinc-400 ml-1.5 font-sans">
                    (of {filteredAndSortedResults.length} currently listed)
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono">
                {/* Copy Selected Alpha IoC (.md) */}
                <button
                  onClick={() => handleCopyAlphaIoc(selectedItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white border border-white/[0.12] px-3 py-1.5 text-xs font-semibold cursor-pointer transition shadow-sm"
                  title="Copy only selected IPs formatted as Alpha Reporter IoC markdown"
                >
                  {copiedSelectedIoc ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                      <span>Copied Selected (.md)!</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5 text-zinc-400" />
                      <span>Copy Selected (.md)</span>
                    </>
                  )}
                </button>

                {/* Download Selected .md */}
                <button
                  onClick={() => handleDownloadAlphaIoc(selectedItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.06] cursor-pointer transition"
                  title="Download selected IoCs as Markdown file"
                >
                  <Download className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Download .md</span>
                </button>

                {/* Export Selected CSV */}
                <button
                  onClick={() => handleExportCsv(selectedItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#0e111a] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.06] cursor-pointer transition"
                  title="Export only selected IPs to CSV"
                >
                  <Download className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Export CSV</span>
                </button>

                {/* Copy Raw IPs */}
                <button
                  onClick={() => handleCopyRawIpsList(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer transition"
                  title="Copy raw selected IPs separated by newlines"
                >
                  {copiedSelectedIpsList ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied IPs</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-slate-400" />
                      <span>Copy IPs</span>
                    </>
                  )}
                </button>

                {/* Copy Defanged IPs */}
                <button
                  onClick={() => handleCopyRawIpsList(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer transition"
                  title="Copy defanged IPs (e.g. 1[.]1[.]1[.]1)"
                >
                  {copiedSelectedDefanged ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Defanged</span>
                    </>
                  ) : (
                    <>
                      <span>[Defang]</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-x-auto rounded-lg border border-slate-800/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80">
                <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                  {/* Select All Checkbox Column */}
                  <th className="py-2.5 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAllFiltered}
                      className="cursor-pointer text-slate-400 hover:text-cyan-400 focus:outline-none transition inline-flex items-center justify-center"
                      title={isAllFilteredSelected ? 'Deselect all filtered' : 'Select all filtered'}
                    >
                      {isAllFilteredSelected ? (
                        <CheckSquare className="h-4 w-4 text-cyan-400" />
                      ) : isSomeFilteredSelected ? (
                        <MinusSquare className="h-4 w-4 text-cyan-400" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-500" />
                      )}
                    </button>
                  </th>

                  {/* IP Address (Sortable) */}
                  <th
                    onClick={() => handleSort('ip')}
                    className="py-2.5 pr-3 cursor-pointer select-none group hover:text-slate-200 transition"
                  >
                    <span>IP Address</span>
                    {renderSortIcon('ip')}
                  </th>

                  {/* Verdict (Sortable) */}
                  <th
                    onClick={() => handleSort('verdict')}
                    className="py-2.5 pr-3 cursor-pointer select-none group hover:text-slate-200 transition"
                  >
                    <span>Verdict</span>
                    {renderSortIcon('verdict')}
                  </th>

                  {/* Composite Score (Sortable) */}
                  <th
                    onClick={() => handleSort('score')}
                    className="py-2.5 pr-3 cursor-pointer select-none group hover:text-slate-200 transition"
                  >
                    <span>Composite Score</span>
                    {renderSortIcon('score')}
                  </th>

                  {/* Country / ISP (Sortable) */}
                  <th
                    onClick={() => handleSort('country')}
                    className="py-2.5 pr-3 cursor-pointer select-none group hover:text-slate-200 transition"
                  >
                    <span>Country / ISP</span>
                    {renderSortIcon('country')}
                  </th>

                  {/* Total Alerts (Sortable) */}
                  <th
                    onClick={() => handleSort('alerts')}
                    className="py-2.5 pr-3 cursor-pointer select-none group hover:text-slate-200 transition"
                  >
                    <span>Total Alerts</span>
                    {renderSortIcon('alerts')}
                  </th>

                  {/* Top Attack Type (Sortable) */}
                  <th
                    onClick={() => handleSort('attack')}
                    className="py-2.5 pr-3 cursor-pointer select-none group hover:text-slate-200 transition"
                  >
                    <span>Top Attack Type</span>
                    {renderSortIcon('attack')}
                  </th>

                  {/* Quick Copy */}
                  <th className="py-2.5 pr-3 text-right">Quick Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono bg-slate-900/50">
                {filteredAndSortedResults.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                      No IP addresses match the selected filter or search query.
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedResults.map((r) => {
                    const isSelected = selectedIps.has(r.ip);
                    return (
                      <tr
                        key={r.ip}
                        className={`transition hover:bg-white/[0.04] ${
                          isSelected ? 'bg-white/[0.06]' : ''
                        }`}
                      >
                        {/* Row Selection Checkbox */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleRowSelect(r.ip)}
                            className="cursor-pointer text-zinc-400 hover:text-white focus:outline-none transition inline-flex items-center justify-center"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-white" />
                            ) : (
                              <Square className="h-4 w-4 text-zinc-600 hover:text-zinc-400" />
                            )}
                          </button>
                        </td>

                        {/* IP Address */}
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/ip/${encodeURIComponent(r.ip)}`}
                            className="font-bold text-zinc-200 hover:text-white hover:underline"
                          >
                            {r.ip}
                          </Link>
                        </td>

                        {/* Verdict */}
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              r.verdict === 'Malicious'
                                ? 'bg-red-950/80 text-red-400 border border-red-800'
                                : r.verdict === 'Suspicious'
                                ? 'bg-amber-950/80 text-amber-400 border border-amber-800'
                                : r.verdict === 'Low risk'
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {r.verdict || 'Unknown'}
                          </span>
                        </td>

                        {/* Composite Score */}
                        <td className="py-2.5 pr-3">
                          <span className="font-bold text-slate-200">
                            {r.compositeScore !== undefined && r.compositeScore !== null
                              ? `${r.compositeScore}/100`
                              : '0/100'}
                          </span>
                        </td>

                        {/* Country / ISP */}
                        <td className="py-2.5 pr-3 font-sans">
                          <span className="rounded bg-slate-800 px-1 py-0.2 text-[10px] font-mono text-slate-300 mr-1.5">
                            {r.countryCode || 'N/A'}
                          </span>
                          <span className="text-[11px] text-slate-300">
                            {r.isp || 'N/A'}
                          </span>
                        </td>

                        {/* Total Alerts */}
                        <td className="py-2.5 pr-3 text-slate-200">
                          {r.totalAlertCount ?? 0}
                        </td>

                        {/* Top Attack Type */}
                        <td className="py-2.5 pr-3 font-sans text-slate-400 text-[11px]">
                          {r.topAttackType || 'None'}
                        </td>

                        {/* Quick Copy Actions */}
                        <td className="py-2.5 pr-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <DefangButton ip={r.ip} />
                            <button
                              onClick={() => handleCopyRowMarkdown(r)}
                              className="inline-flex items-center gap-1 rounded border border-purple-800/80 bg-purple-950/40 px-2 py-1 text-xs font-mono text-purple-300 hover:bg-purple-900/60 hover:text-purple-100 cursor-pointer transition"
                              title="Copy as Alpha Reporter IoC markdown row"
                            >
                              {copiedRowIp === r.ip ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied .md</span>
                                </>
                              ) : (
                                <>
                                  <FileText className="h-3 w-3 text-purple-400" />
                                  <span>.md row</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Metrics */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
            <span>
              Showing {filteredAndSortedResults.length} of {results.length} evaluated IPs
              {searchQuery && ` (filtered by "${searchQuery}")`}
            </span>
            <span>
              Sorted by <span className="text-slate-300">{sortField}</span> (
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'})
            </span>
          </div>
        </div>
      )}

      {/* Markdown Preview & Customization Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e111a] border border-white/[0.08] rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <h3 className="text-base font-bold font-mono text-zinc-100 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-zinc-400" />
                  <span>
                    {iocOptions.reportVariant === 'alpha'
                      ? 'Alpha Reporter'
                      : 'Charlie Reporter'}{' '}
                    IoC Markdown Export
                  </span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Standard ACAD CSIRT Section 2 (INDICATOR OF COMPROMISE) formatted for SOC incident reports
                </p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg hover:bg-white/[0.06] cursor-pointer transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scope & Report Variant Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#141824] p-3 rounded-lg border border-white/[0.06] text-xs font-mono">
              {/* Report Standard Variant */}
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 font-sans font-medium">Standard:</span>
                <button
                  type="button"
                  onClick={() =>
                    setIocOptions((prev) => ({ ...prev, reportVariant: 'alpha' }))
                  }
                  className={`px-2.5 py-1 rounded font-mono cursor-pointer transition ${
                    iocOptions.reportVariant === 'alpha'
                      ? 'bg-white/[0.14] text-white font-semibold'
                      : 'bg-[#0e111a] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Alpha Reporter
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIocOptions((prev) => ({ ...prev, reportVariant: 'charlie' }))
                  }
                  className={`px-2.5 py-1 rounded font-mono cursor-pointer transition ${
                    iocOptions.reportVariant === 'charlie'
                      ? 'bg-white/[0.14] text-white font-semibold'
                      : 'bg-[#0e111a] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Charlie Reporter
                </button>
              </div>

              {/* Scope (All vs Selected) */}
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">Scope:</span>
                <button
                  type="button"
                  onClick={() => setPreviewScope('all')}
                  className={`px-2.5 py-1 rounded font-mono cursor-pointer transition ${
                    previewScope === 'all'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  All ({results.length})
                </button>
                <button
                  type="button"
                  disabled={selectedItems.length === 0}
                  onClick={() => setPreviewScope('selected')}
                  className={`px-2.5 py-1 rounded font-mono cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition ${
                    previewScope === 'selected'
                      ? 'bg-purple-700 text-white font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  Selected ({selectedItems.length})
                </button>
              </div>
            </div>

            {/* Formatting Checkboxes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#141824] p-3 rounded-lg border border-white/[0.06] text-xs font-sans">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={iocOptions.includeSectionHeader}
                  onChange={(e) =>
                    setIocOptions((prev) => ({ ...prev, includeSectionHeader: e.target.checked }))
                  }
                  className="rounded border-white/[0.15] bg-[#0e111a] text-zinc-300 focus:ring-0 accent-zinc-300 cursor-pointer"
                />
                <span>Section Header</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={iocOptions.includeHashRow}
                  onChange={(e) =>
                    setIocOptions((prev) => ({ ...prev, includeHashRow: e.target.checked }))
                  }
                  className="rounded border-white/[0.15] bg-[#0e111a] text-zinc-300 focus:ring-0 accent-zinc-300 cursor-pointer"
                />
                <span>Hash Row</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={iocOptions.includeFootnote}
                  onChange={(e) =>
                    setIocOptions((prev) => ({ ...prev, includeFootnote: e.target.checked }))
                  }
                  className="rounded border-white/[0.15] bg-[#0e111a] text-zinc-300 focus:ring-0 accent-zinc-300 cursor-pointer"
                />
                <span>Footnote Note</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={iocOptions.includeActivityContext}
                  onChange={(e) =>
                    setIocOptions((prev) => ({
                      ...prev,
                      includeActivityContext: e.target.checked,
                    }))
                  }
                  className="rounded border-white/[0.15] bg-[#0e111a] text-zinc-300 focus:ring-0 accent-zinc-300 cursor-pointer"
                />
                <span>Attack Context</span>
              </label>
            </div>

            {/* Markdown Preview Area */}
            <div className="flex-1 overflow-auto bg-[#141824] p-4 rounded-lg border border-white/[0.08] font-mono text-xs text-zinc-200 whitespace-pre selection:bg-white/10 selection:text-white max-h-96">
              {previewMarkdownContent}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] font-sans">
              <span className="text-[11px] text-zinc-500 font-mono">
                {activePreviewItems.length} IP(s) formatted in descending threat severity
              </span>
              <div className="flex items-center gap-2 font-mono">
                <button
                  onClick={() => handleDownloadAlphaIoc(activePreviewItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#141824] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.06] cursor-pointer transition"
                >
                  <Download className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Download .md</span>
                </button>
                <button
                  onClick={() => handleCopyAlphaIoc(activePreviewItems)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.12] hover:bg-white/[0.18] text-white border border-white/[0.12] px-4 py-1.5 text-xs font-semibold cursor-pointer transition shadow-sm"
                >
                  {copiedIoc || copiedSelectedIoc ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Markdown</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
