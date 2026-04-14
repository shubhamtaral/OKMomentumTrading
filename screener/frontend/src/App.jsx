import { useState, useEffect, useCallback, useRef } from 'react';
import SearchBox from './components/SearchBox.jsx';
import Table from './components/Table.jsx';
import ResultCard from './components/ResultCard.jsx';
import { fetchBulkSignals, fetchSingleSignal, fetchSymbols, triggerRunScan } from './services/api.js';

const BULK_LIMIT = 50;

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
        strokeDasharray="31.4" strokeDashoffset="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatusBar({ symbolsCount, lastUpdated }) {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-600">
      {symbolsCount > 0 && (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          {symbolsCount.toLocaleString()} symbols loaded
        </span>
      )}
      {lastUpdated && (
        <span>Last scan: {new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  // Symbol list (fetched once on mount)
  const [symbols, setSymbols] = useState([]);
  const [symError, setSymError] = useState(null);

  // Bulk scan state
  const [bulkSignals, setBulkSignals] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [showAllSignals, setShowAllSignals] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs(prev => [{
      id: Date.now() + Math.random(),
      msg,
      type,
      time: new Date().toLocaleTimeString()
    }, ...prev].slice(0, 50));
  }, []);

  // AI Config
  const [aiKey, setAiKey] = useState(localStorage.getItem('ok_ai_key') || '');
  const [showAiConfig, setShowAiConfig] = useState(false);

  // Single scan state
  const [singleSignal, setSingleSignal] = useState(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleError, setSingleError] = useState(null);
  const [scannedSymbol, setScannedSymbol] = useState('');

  // Active tab
  const [activeTab, setActiveTab] = useState('bulk');
  // 'bulk' | 'single'

  const bulkRef = useRef(null);

  // ── Fetch symbol list on mount ───────────────────────────────────────────
  useEffect(() => {
    fetchSymbols()
      .then(data => setSymbols(data.symbols || []))
      .catch(err => {
        console.warn('Symbol fetch failed:', err.message);
        setSymError('Could not load symbol list — autocomplete disabled.');
      });
  }, []);
  // ── Bulk scan logic ────────────────────────────────────────────────────────
  const refreshBulkData = useCallback(async () => {
    setBulkLoading(true);
    try {
      const data = await fetchBulkSignals(BULK_LIMIT, showAllSignals);
      setBulkSignals(data.signals || []);
      setLastUpdated(new Date().toISOString());
      setBulkLoading(false);
    } catch (err) {
      setBulkError(err.message || 'Failed to fetch signals.');
      setBulkLoading(false);
    }
  }, [showAllSignals]);

  const runBulkScan = useCallback(async () => {
    setIsScanning(true);
    setBulkError(null);
    addLog('Requesting fresh market-wide scan...', 'brand');
    try {
      const trigger = await triggerRunScan(aiKey);
      addLog(trigger.message, 'info');

      // Refresh UI data immediately to show current DB state (unblocked)
      await refreshBulkData();

      // After 8s (approx job completion), refresh again for fresh signals
      setTimeout(async () => {
        await refreshBulkData();
        addLog('Market snapshot refreshed from fresh scan.', 'success');
        setIsScanning(false);
      }, 8000);

    } catch (err) {
      setBulkError(err.message || 'Bulk scan trigger failed.');
      addLog('Bulk scan failed: ' + err.message, 'error');
      setIsScanning(false);
    }
  }, [aiKey, addLog, refreshBulkData]);

  // Initial load and filter changes
  useEffect(() => {
    refreshBulkData();
  }, [showAllSignals, refreshBulkData]);

  // ── Single Scan Handler ──────────────────────────────────────────
  const handleSymbolSearch = useCallback(async (symbol) => {
    if (!symbol) return;
    setSingleLoading(true);
    setSingleError(null);
    setSingleSignal(null);
    setScannedSymbol(symbol);
    addLog(`Searching ${symbol}...`, 'info');

    try {
      // Pass the locally stored AI key to the API
      const result = await fetchSingleSignal(symbol, aiKey);
      setSingleSignal(result);
      addLog(`Analysis for ${symbol} complete.`, 'success');
      setActiveTab('single');
    } catch (err) {
      setSingleError(err.message || 'Scan failed.');
      addLog(`Scan failed for ${symbol}: ${err.message}`, 'error');
    } finally {
      setSingleLoading(false);
    }
  }, [aiKey, addLog]);

  const handleSaveAIKey = (val) => {
    setAiKey(val);
    localStorage.setItem('ok_ai_key', val);
    addLog('AI configuration updated.', 'brand');
  };

  // ── Row click → single scan ──────────────────────────────────────────────
  const handleRowSelect = useCallback((sig) => {
    handleSymbolSearch(sig.symbol);
  }, [handleSymbolSearch]);

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const TAB_BASE = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 focus:outline-none';
  const TAB_ACTIVE = 'bg-gray-800 text-gray-100';
  const TAB_IDLE = 'text-gray-500 hover:text-gray-300 hover:bg-gray-900';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">

      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <header className="border-b border-gray-800/60 bg-gray-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-black tracking-tight text-white">
              OK <span className="text-brand">Momentum</span> Screener
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">NSE</span>
          </div>
          <StatusBar symbolsCount={symbols.length} lastUpdated={lastUpdated} />
        </div>

        {/* Intelligence Config Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 border-t border-gray-800/40">
          <div className="py-2">
            <button
              onClick={() => setShowAiConfig(!showAiConfig)}
              className="flex items-center gap-2 group"
            >
              <span className="text-sm">🧠</span>
              <span className="text-[10px] uppercase font-black tracking-widest text-gray-400 group-hover:text-gray-200 transition-colors">
                Intelligence Config {aiKey ? `(AI Mode: Active)` : '(Offline)'}
              </span>
              <span className={`text-[10px] transition-transform duration-200 ${showAiConfig ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {showAiConfig && (
              <div className="mt-3 p-4 rounded-xl bg-gray-900/40 border border-gray-800 space-y-4 animate-in slide-in-from-top-2 duration-200 mb-4">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1.5">AI API KEY (OPENAI / OPENROUTER)</label>
                    <input
                      type="password"
                      placeholder="sk-... or sk-or-..."
                      value={aiKey}
                      onChange={(e) => handleSaveAIKey(e.target.value)}
                      className="w-full bg-black/40 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand transition-colors"
                    />
                  </div>
                  <div className="shrink-0 flex items-end">
                    <div className="px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Provider</span>
                      <span className="text-[10px] font-black text-brand uppercase">
                        {aiKey.startsWith('sk-or-') ? 'OpenRouter' : aiKey ? 'OpenAI' : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-10">

        {/* ── Tab switcher ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 p-1 bg-gray-900/40 border border-gray-800 rounded-xl w-fit">
          <button
            className={`${TAB_BASE} ${activeTab === 'bulk' ? TAB_ACTIVE : TAB_IDLE}`}
            onClick={() => setActiveTab('bulk')}
          >
            Market Signals
            {bulkSignals.length > 0 && (
              <span className="ml-2 text-xs bg-brand/20 text-brand px-1.5 py-0.5 rounded-full">
                {bulkSignals.length}
              </span>
            )}
          </button>
          <button
            className={`${TAB_BASE} ${activeTab === 'single' ? TAB_ACTIVE : TAB_IDLE}`}
            onClick={() => setActiveTab('single')}
          >
            Single Search
            {(singleSignal || singleError) && (
              <span className="ml-2 w-2 h-2 rounded-full bg-brand inline-block" />
            )}
          </button>
        </div>

        {/* ── Market Signals (Bulk) ─── NOW FIRST ────────────────────── */}
        {activeTab === 'bulk' && (
          <section ref={bulkRef} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-200">Current Market Setups</h2>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-xs text-gray-500 flex items-center gap-2">
                    <span>{bulkSignals.length} opportunities detected</span>
                    <span className="w-1 h-1 rounded-full bg-gray-800" />
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-tighter italic">Mon-Fri @ 8 PM</span>
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-gray-700 bg-gray-900 text-brand focus:ring-brand focus:ring-offset-0"
                      checked={showAllSignals}
                      onChange={(e) => setShowAllSignals(e.target.checked)}
                    />
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Show Quality B</span>
                  </label>
                </div>
              </div>
              <button
                onClick={runBulkScan}
                disabled={isScanning}
                className={[
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold',
                  'bg-brand hover:bg-brand-dark text-white',
                  'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-gray-950',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'shadow-lg shadow-brand/20',
                ].join(' ')}
              >
                {isScanning ? <><Spinner size={15} /> Syncing…</> : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    rerun scan
                  </>
                )}
              </button>
            </div>

            {bulkError && (
              <div className="rounded-xl border border-red-800/50 bg-red-950/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
                <span className="text-base">⚠</span> {bulkError}
              </div>
            )}

            <Table signals={bulkSignals} onSelect={handleRowSelect} />
          </section>
        )}

        {/* ── Single Stock Scanner ─── NOW SECOND ───────────────────── */}
        <section className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Deep Dive Analyzer
              </h2>
              <p className="text-[10px] text-gray-600 mt-1 italic">
                Enter an AI Key to unlock the full Oliver Kell Institutional Narrative.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-gray-600">Context:</span>
              <span className="text-[10px] font-black text-brand uppercase bg-brand/10 border border-brand/20 px-2 py-0.5 rounded">
                Oliver Kell Setup
              </span>
            </div>
          </div>
          <SearchBox
            symbols={symbols}
            onScan={handleSymbolSearch}
            loading={singleLoading}
          />
          {symError && (
            <p className="mt-2 text-xs text-amber-500">{symError}</p>
          )}
        </section>

        {/* ── Single result panel ───────────────────────────────────── */}
        {activeTab === 'single' && (
          <section className="animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-200">
                {scannedSymbol ? (
                  <>Result for <span className="text-brand font-black">{scannedSymbol}</span></>
                ) : (
                  'Single Stock Result'
                )}
              </h2>
              <button
                onClick={() => setSingleSignal(null)}
                className="text-[10px] text-gray-500 hover:text-gray-300 uppercase font-bold"
              >
                Clear
              </button>
            </div>
            <ResultCard
              signal={singleSignal}
              symbol={scannedSymbol}
              error={singleError}
              loading={singleLoading}
              isAIActive={!!aiKey}
              onOpenAIConfig={() => setShowAiConfig(true)}
              onRetry={() => handleSymbolSearch(scannedSymbol)}
            />
            {!singleSignal && !singleError && !singleLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-600 border border-dashed border-gray-800 rounded-2xl">
                <p className="text-sm">Select a stock above or search for a symbol to begin study.</p>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="mt-12 border-t border-gray-800/40 py-8 text-center space-y-2">
        <p className="text-xs text-gray-500 font-medium">
          OK Momentum Screener · Signals precomputed from NSE data
        </p>
        <p className="text-[10px] text-gray-700 max-w-2xl mx-auto px-4 uppercase tracking-widest font-bold">
          ⚠ DISCLAIMER: For Educational & Study Purposes Only. Not Financial Advice. ⚠
        </p>
      </footer>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function ScoreInfoItem({ icon, label, desc }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg leading-none mt-0.5">{icon}</span>
      <div>
        <p className="text-xs font-bold text-gray-300 leading-tight">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
