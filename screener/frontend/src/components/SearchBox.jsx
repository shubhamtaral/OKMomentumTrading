import { useState, useEffect, useRef, useCallback } from 'react';

const LAST_SYMBOL_KEY = 'okScreener_lastSymbol';
const MAX_SUGGESTIONS = 10;

/**
 * SearchBox
 * ---------
 * Single-stock symbol input with:
 *   - Local auto-suggest filtering from a pre-fetched symbol list
 *   - localStorage persistence of last searched symbol
 *   - Keyboard navigation (↑ ↓ Enter Escape)
 *   - Normalisation (uppercase + .NS suffix) before calling onScan
 *
 * Props:
 *   symbols   { symbol: string, name: string }[]  Full symbol list (cached in parent)
 *   onScan    (normalizedSymbol: string) => void  Called on submit
 *   loading   boolean
 */
export default function SearchBox({ symbols = [], onScan, loading = false }) {
  const [input, setInput]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const [open, setOpen]             = useState(false);
  const inputRef  = useRef(null);
  const listRef   = useRef(null);

  // ── Restore last symbol on mount ──────────────────────────────────────────
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_SYMBOL_KEY);
      if (last) setInput(last);
    } catch (_) { /* localStorage blocked */ }
  }, []);

  // ── Filter suggestions when input changes ─────────────────────────────────
  useEffect(() => {
    const term = input.trim().toUpperCase();
    if (!term || symbols.length === 0) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    // Prioritise: symbol starts with term → then symbol contains → then name contains
    const exact   = symbols.filter(s => s.symbol.startsWith(term));
    const symLike = symbols.filter(s => !s.symbol.startsWith(term) && s.symbol.includes(term));
    const nameLike= symbols.filter(s => !s.symbol.includes(term) && s.name.toUpperCase().includes(term));
    const merged  = [...exact, ...symLike, ...nameLike].slice(0, MAX_SUGGESTIONS);
    setSuggestions(merged);
    setActiveIdx(-1);
    setOpen(merged.length > 0);
  }, [input, symbols]);

  // ── Normalise helper ──────────────────────────────────────────────────────
  const normalize = useCallback((raw) => {
    const s = raw.trim().toUpperCase();
    return s.endsWith('.NS') ? s : s + '.NS';
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = useCallback((rawSymbol) => {
    const sym = rawSymbol || input;
    if (!sym.trim()) return;
    const normalized = normalize(sym);
    setInput(normalized);
    setOpen(false);
    setSuggestions([]);
    try { localStorage.setItem(LAST_SYMBOL_KEY, normalized); } catch (_) {}
    onScan && onScan(normalized);
  }, [input, normalize, onScan]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (!open) {
      if (e.key === 'Enter') submit();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) submit(suggestions[activeIdx].symbol);
      else submit();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  }, [open, activeIdx, suggestions, submit]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (inputRef.current && !inputRef.current.closest('.searchbox-root')?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Scroll active item into view ──────────────────────────────────────────
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  return (
    <div className="searchbox-root relative w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Enter symbol (e.g. RELIANCE or RELIANCE.NS)"
            disabled={loading}
            className={[
              'w-full px-4 py-3 rounded-lg border bg-gray-900 text-gray-100',
              'placeholder-gray-500 text-sm font-mono',
              'focus:outline-none focus:ring-2 focus:ring-brand',
              open ? 'rounded-b-none border-brand' : 'border-gray-700 hover:border-gray-500',
              loading ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={open}
          />

          {/* Suggestions dropdown */}
          {open && suggestions.length > 0 && (
            <ul
              ref={listRef}
              className="absolute z-50 w-full bg-gray-900 border border-t-0 border-brand rounded-b-lg
                         shadow-2xl max-h-64 overflow-y-auto"
              role="listbox"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.symbol}
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={() => submit(s.symbol)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={[
                    'flex items-center justify-between px-4 py-2.5 cursor-pointer',
                    'border-b border-gray-800 last:border-0',
                    i === activeIdx ? 'bg-gray-800' : 'hover:bg-gray-800/60',
                  ].join(' ')}
                >
                  <span className="font-mono text-sm text-brand font-semibold">{s.symbol}</span>
                  <span className="text-xs text-gray-400 ml-3 truncate max-w-[55%] text-right">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={() => submit()}
          disabled={loading || !input.trim()}
          className={[
            'px-5 py-3 rounded-lg text-sm font-semibold whitespace-nowrap',
            'bg-brand hover:bg-brand-dark text-white',
            'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-gray-950',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Spinner size={14} /> Scanning…
            </span>
          ) : 'Scan Stock'}
        </button>
      </div>
    </div>
  );
}

// ── Inline spinner (avoids extra import) ─────────────────────────────────────
function Spinner({ size = 16 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
              strokeLinecap="round" strokeDasharray="31.4" strokeDashoffset="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3"
            strokeLinecap="round" />
    </svg>
  );
}
