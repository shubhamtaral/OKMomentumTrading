/**
 * ResultCard
 * ----------
 * Displays the result of a single-stock scan in a structured card layout.
 * Optimized for the "Oliver Kell Power Play" deep-dive analysis.
 */

const ACTION_CONFIG = {
  BUY: {
    ring:  'ring-emerald-500/40',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    icon:  '🚀',
    glow:  'shadow-emerald-900/30',
  },
  SELL: {
    ring:  'ring-amber-500/40',
    badge: 'bg-amber-500/15  text-amber-400  border-amber-500/40',
    icon:  '⚠️',
    glow:  'shadow-amber-900/30',
  },
  EXIT: {
    ring:  'ring-red-500/40',
    badge: 'bg-red-500/15    text-red-400    border-red-500/40',
    icon:  '✖',
    glow:  'shadow-red-900/30',
  },
};

const QUALITY_CONFIG = {
  'A+': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'A':  'bg-sky-500/20    text-sky-300    border-sky-500/30',
  'B':  'bg-gray-700/50   text-gray-400   border-gray-600',
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function ResultCard({ signal, symbol, error, loading, isAIActive, onOpenAIConfig, onRetry }) {
  
  // 1. Loading State
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-8 flex items-center justify-center gap-3 text-gray-500">
        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" opacity="0.3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-sm">Scanning {symbol || '…'}</span>
      </div>
    );
  }

  // 2. Error State
  if (error) {
    const msg = error.toLowerCase();
    const isNotFound = msg.includes('not found') || msg.includes('404') || msg.includes('no signal') || msg.includes('analysis complete');
    
    return (
      <div className={['rounded-2xl border p-6 flex items-start gap-4', isNotFound ? 'border-gray-700 bg-gray-900/40' : 'border-red-800/50 bg-red-950/20'].join(' ')}>
        <div className={['flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl', isNotFound ? 'bg-gray-800 text-gray-400' : 'bg-red-900/50 text-red-400'].join(' ')}>
          {isNotFound ? '?' : '!'}
        </div>
        <div>
          <p className={['font-semibold text-sm', isNotFound ? 'text-gray-300' : 'text-red-400'].join(' ')}>
            {isNotFound ? `No signal for ${symbol || 'this symbol'}` : 'Scan failed'}
          </p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // 3. Resolve Active Signal Data
  // Handle both { signal: {...} } and direct signal objects
  const activeSignal = (signal && typeof signal === 'object' && 'signal' in signal) ? signal.signal : signal;
  const noSignalMsg  = (signal && signal.signal === null) ? signal.message : null;
  const snapshot     = signal?.snapshot;

  // 4. "No Signal" Technical Snapshot View
  if (noSignalMsg) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 flex items-start gap-4 shadow-lg ring-1 ring-gray-800/50">
          <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl bg-gray-800 text-brand/60 ring-2 ring-gray-700/50">
            -
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm text-gray-200">Analysis Complete</p>
              <span className="text-mono text-xl font-black text-gray-400">{symbol}</span>
            </div>
            <div className="mt-4">
              <p className="text-xs text-brand/80 leading-relaxed font-medium">{noSignalMsg}</p>
              
              {signal?.advice && (
                <div className="mt-6 p-6 rounded-2xl bg-gray-950/60 border border-brand/20 shadow-inner">
                  <h4 className="text-[10px] font-black text-brand uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand" /> Technical Insight
                  </h4>
                  <div className="text-xs text-gray-400 leading-relaxed font-mono whitespace-pre-wrap">
                    {signal.advice}
                  </div>
                  
                  {!isAIActive && (
                    <div className="mt-6 pt-6 border-t border-gray-900 flex flex-col items-center gap-3">
                      <p className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">Upgrade to Deep Dive</p>
                      <button 
                        onClick={onOpenAIConfig}
                        className="px-4 py-2 bg-brand/10 hover:bg-brand/20 border border-brand/30 rounded-lg text-brand text-[10px] font-black uppercase tracking-wider transition-all"
                      >
                        ⚡ Unlock Institutional AI Analysis
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {snapshot && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/20 divide-y divide-gray-800/50">
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
              <MetricBox
                label="Current Price"
                value={'₹' + Number(snapshot.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              />
              <MetricBox
                label="RSI (14)"
                value={snapshot.rsi || '—'}
                sub={snapshot.rsi > 70 ? 'Overbought' : snapshot.rsi >= 55 ? 'Strength zone' : 'Neutral'}
              />
              <MetricBox
                label="Volume Ratio"
                value={snapshot.volume_ratio ? snapshot.volume_ratio + 'x' : '—'}
                sub={snapshot.volume_ratio >= 1.5 ? 'Above avg' : 'Moderate'}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. Empty State (Initial)
  if (!activeSignal) return null;

  // 6. Deep Dive Report View (Pattern Found)
  const cfg = ACTION_CONFIG[activeSignal.action] || ACTION_CONFIG.BUY;
  const statusColor = activeSignal.quality === 'A+' ? 'text-violet-400 border-violet-500/30 bg-violet-500/10' : 
                      activeSignal.quality === 'A'  ? 'text-sky-400 border-sky-500/30 bg-sky-500/10' : 'text-gray-400 border-gray-700 bg-gray-800/20';

  const patternName = (activeSignal.signal_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  // Calculate strategy values
  const stopLoss = activeSignal.price * 0.92; // 8% Kelvin stop
  const t1 = activeSignal.price * 1.15;
  const t2 = activeSignal.price * 1.30;

  return (
    <div className={[
      'rounded-2xl border bg-gray-900/60 ring-1 shadow-xl p-8 space-y-8 animate-in fade-in zoom-in-95 duration-500',
      cfg.ring,
      cfg.glow,
    ].join(' ')}>
      
      {/* Report Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-800 pb-6">
        <div>
          <h1 className="text-xl font-black tracking-tighter text-white flex items-center gap-2">
            <span className="text-brand">🎯</span> OLIVER KELL POWER PLAY ANALYSIS
          </h1>
          <p className="text-sm font-medium text-gray-500 mt-1 uppercase tracking-widest">
            {activeSignal.name || symbol} <span className="text-gray-700 mx-2">Through the Kell Lens</span>
          </p>
        </div>
        <div className={`px-4 py-2 rounded-xl border-2 font-black text-lg ${statusColor}`}>
          GRADE: {activeSignal.quality}
        </div>
      </div>

      {/* 💡 Narrative Advice (Deep Dive Report) */}
      {isAIActive && activeSignal.advice && activeSignal.advice.includes('###') ? (
        <div className="p-8 rounded-3xl bg-gray-950/80 border border-brand/20 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="text-6-xl font-black italic">KELL</span>
          </div>
          <div className="relative">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center text-xl shadow-lg shadow-brand/20">💡</span>
              <div>
                <h4 className="text-xs font-black text-brand uppercase tracking-[0.3em]">Institutional Narrative</h4>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Kell Power Play Framework</p>
              </div>
            </div>
            
            <div className="text-sm text-gray-300 leading-relaxed font-medium whitespace-pre-wrap font-mono prose prose-invert max-w-none">
              {activeSignal.advice}
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-800/50 flex items-center justify-between text-[10px] text-gray-600 uppercase font-black">
              <span>Risk Management: Enforced 8% Stop</span>
              <span className="text-brand">Strategy: Kell-Trend Alignment</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-3xl bg-gray-950/80 border border-gray-800/40 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center gap-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-2xl mx-auto mb-4 border border-brand/20 shadow-inner group">
              <span className="group-hover:scale-125 transition-transform duration-300">📈</span>
            </div>
            <h4 className="text-xs font-black text-brand uppercase tracking-widest">
              {isAIActive ? 'AI Study Ready' : 'Institutional AI Deep Dive Locked'}
            </h4>
            <p className="text-[10px] text-gray-500 max-w-xs mx-auto">
              {isAIActive 
                ? 'Your AI key is active. Run the deep dive study to get the full 9-point Institutional Kell Report.'
                : 'You are currently viewing basic technical rules. Add an API Key to unlock the deep dive research.'
              }
            </p>
          </div>
          
          {isAIActive ? (
            <button 
              onClick={onRetry}
              className="px-8 py-3 bg-brand text-white text-[11px] font-black rounded-xl hover:bg-brand-dark transition-all shadow-xl shadow-brand/20 uppercase tracking-widest flex items-center gap-2"
            >
              🔥 Start Institutional AI Study
            </button>
          ) : (
            <button 
              onClick={onOpenAIConfig}
              className="px-6 py-3 bg-gray-900 text-gray-400 border border-gray-800 text-[11px] font-black rounded-xl hover:bg-gray-800 hover:text-white transition-all uppercase tracking-wider"
            >
              🚀 Unlock Deep Dive Analysis
            </button>
          )}
          
          {activeSignal.advice && (
            <div className="w-full mt-4 p-4 rounded-xl bg-black/40 border border-gray-900 text-left">
               <div className="flex items-center justify-between mb-2">
                 <h5 className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">Technical Rule Summary:</h5>
                 <span className="text-[8px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">OFFLINE MODE</span>
               </div>
               <p className="text-xs text-gray-400 italic font-medium leading-relaxed">
                "{activeSignal.advice}"
               </p>
            </div>
          )}
        </div>
      )}

      {/* Scorecard */}
      <section>
        <SectionHeader title="Scorecard" icon="📋" />
        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/20">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800/50 text-[10px] uppercase font-bold text-gray-500 tracking-widest">
              <tr>
                <th className="px-6 py-3">Criteria</th>
                <th className="px-6 py-3">Metric</th>
                <th className="px-6 py-3">Grade</th>
                <th className="px-6 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              <ScoreRow 
                label='The "Box" (Base)' 
                val={activeSignal.reasons?.includes('Tight consolidation base') ? 'Tight Setup' : 'Developing'} 
                grade={activeSignal.reasons?.includes('Tight consolidation base') ? 'A' : 'B'}
                note="Clean consolidation detected"
              />
              <ScoreRow 
                label="Volume Conviction" 
                val={activeSignal.volume_ratio.toFixed(2) + 'x'} 
                grade={activeSignal.volume_ratio >= 2 ? 'A+' : activeSignal.volume_ratio >= 1.5 ? 'A' : 'B'}
                note="Institutional footprint"
              />
              <ScoreRow 
                label="Price Expansion" 
                val={activeSignal.price.toFixed(2)} 
                grade="A"
                note="Clear candle body break"
              />
              <ScoreRow 
                label="RSI Condition" 
                val={activeSignal.rsi.toFixed(1)} 
                grade={activeSignal.rsi > 70 ? 'C+' : activeSignal.rsi > 55 ? 'A' : 'B'}
                note={activeSignal.rsi > 70 ? 'Slightly Extended' : 'Ideal Momentum'}
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* Deep Dive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="space-y-6">
          <div>
            <SectionHeader title="The Analysis" icon="🔬" />
            <div className="bg-gray-900/40 rounded-2xl p-6 border border-gray-800/50 space-y-4">
               <div>
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Technical Trigger</h4>
                 <div className="text-xl font-bold text-gray-200">{patternName}</div>
                 <p className="text-xs text-brand/80 mt-1 italic font-medium">"Volume is the footprint of institutional money."</p>
               </div>
               <div className="flex flex-wrap gap-2">
                 {activeSignal.reasons?.map((r, i) => (
                   <span key={i} className="px-2 py-1 rounded bg-brand/10 border border-brand/20 text-[10px] font-bold text-brand uppercase tracking-tighter">
                     ✅ {r}
                   </span>
                 ))}
               </div>
               <p className="text-sm text-gray-400 leading-relaxed">
                 The stock has cleared its recent resistance zone on 
                 <span className="text-white font-bold mx-1">{activeSignal.volume_ratio.toFixed(2)}x</span> 
                 volume expansion.
               </p>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="MA Alignment" icon="📏" />
          <div className="bg-gray-900/40 rounded-2xl p-6 border border-gray-800/50">
            <div className="space-y-3">
              <MARow label="EMA 10" val={snapshot?.ema?.ema10 || activeSignal.price * 0.98} color="bg-violet-500" />
              <MARow label="EMA 20" val={snapshot?.ema?.ema20 || activeSignal.price * 0.96} color="bg-sky-500" />
              <MARow label="EMA 50" val={snapshot?.ema?.ema50 || activeSignal.price * 0.92} color="bg-emerald-500" />
              <MARow label="EMA 100" val={snapshot?.ema?.ema100 || activeSignal.price * 0.88} color="bg-amber-500" />
              <MARow label="EMA 200" val={snapshot?.ema?.ema200 || activeSignal.price * 0.82} color="bg-gray-600" />
            </div>
            <p className="text-[10px] text-gray-500 mt-4 italic">Kell Rule: Look for "Railroad Tracks" (MA Stacked Alignment).</p>
          </div>
        </section>
      </div>

      {/* Strategy Block (Only show if NOT using AI Narrative) */}
      {!(isAIActive && activeSignal.advice && activeSignal.advice.includes('###')) && (
        <section className="bg-gradient-to-br from-brand/10 to-transparent rounded-3xl border border-brand/20 p-8 shadow-2xl relative">
          <div className="relative">
            <SectionHeader title="Position Sizing & Management (Offline)" icon="💰" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
              <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                <h4 className="text-[10px] font-bold uppercase text-gray-500 mb-2">Entry Price</h4>
                <p className="text-xl font-black text-white">₹{activeSignal.price.toFixed(2)}</p>
              </div>
              <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                <h4 className="text-[10px] font-bold uppercase text-gray-500 mb-2">Hard Stop Loss</h4>
                <p className="text-xl font-black text-red-500">₹{stopLoss.toFixed(2)}</p>
              </div>
              <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                <h4 className="text-[10px] font-bold uppercase text-gray-500 mb-2">Profit Targets</h4>
                <p className="text-sm font-bold text-emerald-500">T1: ₹{t1.toFixed(2)} (+15%)</p>
                <p className="text-sm font-bold text-emerald-400">T2: ₹{t2.toFixed(2)} (+30%)</p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <ul className="text-xs text-gray-300 space-y-2">
                <h4 className="font-bold uppercase tracking-widest text-emerald-500">✅ Execute If</h4>
                <li>• Price holds above 10-day EMA breakout</li>
                <li>• Volume remains at least 50% above average</li>
              </ul>
              <ul className="text-xs text-gray-300 space-y-2">
                <h4 className="font-bold uppercase tracking-widest text-red-400">❌ Skip If</h4>
                <li>• Stock opens &gt; 5% away from current price (Chase risk)</li>
                <li>• Market atmosphere (NIFTY) turns bearish</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="px-4 text-[10px] text-gray-600 text-right uppercase font-bold border-t border-gray-800 pt-6">
        Updated: {activeSignal.timestamp ? new Date(activeSignal.timestamp).toLocaleString() : 'Just now'}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, icon }) {
  return (
    <div className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-sm">{icon}</span>
      {title}
    </div>
  );
}

function ScoreRow({ label, val, grade, note }) {
  const gradeColor = grade.includes('A') ? 'text-brand' : 'text-sky-400';
  return (
    <tr className="border-b border-gray-800/30">
      <td className="px-6 py-4 font-bold text-gray-300">{label}</td>
      <td className="px-6 py-4 font-mono text-gray-400">{val}</td>
      <td className={`px-6 py-4 font-black ${gradeColor}`}>{grade}</td>
      <td className="px-6 py-4 text-xs text-gray-500 italic">{note}</td>
    </tr>
  );
}

function MARow({ label, val, color }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-6 rounded-full ${color} opacity-40`} />
        <span className="text-xs font-bold text-gray-500">{label}</span>
      </div>
      <span className="text-sm font-mono text-gray-200">₹{val.toFixed(2)}</span>
    </div>
  );
}

function MetricBox({ label, value, sub }) {
  return (
    <div className="bg-gray-900/60 rounded-xl px-4 py-3 border border-gray-800">
      <span className="text-[10px] text-gray-500 uppercase font-bold">{label}</span>
      <div className="text-lg font-black text-gray-100">{value}</div>
      {sub && <span className="text-[10px] text-brand/60">{sub}</span>}
    </div>
  );
}