import { useState, useMemo } from 'react';

// ── Colour helpers ────────────────────────────────────────────────────────────

const ACTION_STYLES = {
  BUY:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  SELL:  'bg-amber-500/15  text-amber-400  border border-amber-500/30',
  EXIT:  'bg-red-500/15    text-red-400    border border-red-500/30',
  WATCH: 'bg-gray-500/15   text-gray-400   border border-gray-500/30',
};

const QUALITY_STYLES = {
  'A+': 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
  'A':  'bg-sky-500/20    text-sky-300    border border-sky-500/30',
  'B':  'bg-gray-700/50   text-gray-400   border border-gray-600',
  'N/A': 'bg-gray-900/50   text-gray-600   font-normal',
};

const ROW_ACCENT = {
  BUY:  'border-l-2 border-l-emerald-500',
  SELL: 'border-l-2 border-l-amber-500',
  EXIT: 'border-l-2 border-l-red-500',
};

// ── Sort config ───────────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'symbol',       label: 'Symbol / Name', sortable: true,  align: 'left'  },
  { key: 'sector',       label: 'Sector',        sortable: true,  align: 'left'  },
  { key: 'price',        label: 'Price ₹',      sortable: true,  align: 'right' },
  { key: 'rsi',          label: 'RSI',          sortable: true,  align: 'right' },
  { key: 'volume_ratio', label: 'Vol Ratio',    sortable: true,  align: 'right' },
  { key: 'signal_type',  label: 'Pattern',      sortable: false, align: 'left'  },
  { key: 'action',       label: 'Action',       sortable: false, align: 'center'},
  { key: 'score',        label: 'Score',        sortable: true,  align: 'center'},
  { key: 'quality',      label: 'Quality',      sortable: true,  align: 'center'},
  { key: 'timestamp',    label: 'Time',         sortable: true,  align: 'right' },
];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(key, value) {
  if (value == null) return '—';
  switch (key) {
    case 'price':
      return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'rsi':
    case 'volume_ratio':
      return Number(value).toFixed(2);
    case 'signal_type':
      return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    case 'timestamp':
      return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    default:
      return value;
  }
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ direction }) {
  if (!direction) return <span className="ml-1 text-gray-600">⇅</span>;
  return <span className="ml-1 text-brand">{direction === 'asc' ? '↑' : '↓'}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Table
 * -----
 * Displays bulk scan results with client-side sorting.
 *
 * Props:
 *   signals   Signal[]    Array of signal objects
 *   onSelect  (signal) => void  Optional row click handler
 */
export default function Table({ signals = [], onSelect }) {
  const [sortKey, setSortKey]   = useState('score');
  const [sortDir, setSortDir]   = useState('desc');

  const filtered = useMemo(() => {
    return signals.filter(s => s.signal_type !== 'NEUTRAL');
  }, [signals]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      // Strings: lexicographic
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [signals, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  if (signals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">No signals to display. Run a scan to get started.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm">
        {/* Header */}
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wider">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => col.sortable && handleSort(col.key)}
                className={[
                  'px-4 py-3 font-medium',
                  col.align === 'right'  ? 'text-right'  : '',
                  col.align === 'center' ? 'text-center' : '',
                  col.align === 'left'   ? 'text-left'   : '',
                  col.sortable ? 'cursor-pointer select-none hover:text-gray-200' : '',
                ].join(' ')}
              >
                {col.label}
                {col.sortable && <SortIcon direction={sortKey === col.key ? sortDir : null} />}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-gray-800/60">
          {sorted.map((sig, idx) => (
            <tr
              key={sig.symbol + '-' + idx}
              onClick={() => onSelect && onSelect(sig)}
              className={[
                ROW_ACCENT[sig.action] || '',
                'bg-gray-950 hover:bg-gray-900/80 transition-colors duration-100',
                onSelect ? 'cursor-pointer' : '',
              ].join(' ')}
            >
              {/* Symbol / Name */}
              <td className="px-4 py-3">
                <div className="font-mono font-bold text-gray-100">{sig.symbol}</div>
                <div className="text-[10px] text-gray-500 truncate max-w-[120px]">{sig.name || '—'}</div>
              </td>

              {/* Sector */}
              <td className="px-4 py-3 text-[10px] text-gray-400 font-medium">
                {sig.sector || '—'}
              </td>

              {/* Price */}
              <td className="px-4 py-3 text-right text-gray-200 tabular-nums">
                {fmt('price', sig.price)}
              </td>

              {/* RSI */}
              <td className="px-4 py-3 text-right tabular-nums">
                <RSIBadge value={sig.rsi} />
              </td>

              {/* Volume Ratio */}
              <td className="px-4 py-3 text-right tabular-nums">
                <VolBadge value={sig.volume_ratio} />
              </td>

              {/* Pattern */}
              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                {fmt('signal_type', sig.signal_type)}
              </td>

              {/* Action */}
              <td className="px-4 py-3 text-center">
                <span className={[
                  'inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide',
                  ACTION_STYLES[sig.action] || '',
                ].join(' ')}>
                  {sig.action}
                </span>
              </td>

              {/* Score */}
              <td className="px-4 py-3 text-center">
                <ScoreBar score={sig.score} />
              </td>

              {/* Quality */}
              <td className="px-4 py-3 text-center">
                <span className={[
                  'inline-block px-2.5 py-0.5 rounded text-xs font-bold',
                  QUALITY_STYLES[sig.quality] || '',
                ].join(' ')}>
                  {sig.quality}
                </span>
              </td>

              {/* Timestamp */}
              <td className="px-4 py-3 text-right text-gray-500 tabular-nums text-xs">
                {fmt('timestamp', sig.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer count */}
      <div className="bg-gray-900/50 px-4 py-2 text-xs text-gray-500 border-t border-gray-800">
        Showing {sorted.length} signal{sorted.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RSIBadge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const v = Number(value);
  const color = v > 70 ? 'text-amber-400' : v >= 55 ? 'text-emerald-400' : 'text-gray-400';
  return <span className={color + ' font-mono'}>{v.toFixed(1)}</span>;
}

function VolBadge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const v = Number(value);
  const color = v >= 2 ? 'text-emerald-400' : v >= 1.5 ? 'text-sky-400' : 'text-gray-400';
  return <span className={color + ' font-mono'}>{v.toFixed(2)}x</span>;
}

function ScoreBar({ score }) {
  const s = Number(score) || 0;
  const pct = Math.min(100, (s / 9) * 100);
  const barColor = s >= 7 ? 'bg-violet-500' : s >= 5 ? 'bg-sky-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-12 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: pct + '%' }} />
      </div>
      <span className="text-gray-300 font-mono text-xs w-4">{s}</span>
    </div>
  );
}
