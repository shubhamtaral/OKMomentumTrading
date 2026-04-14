'use strict';

const { latestRSI, latestEMA, high52Week, avgVolume } = require('./indicators');

/**
 * nfmt(val, dec)
 * Null-safe formatter for technical indicators.
 */
function nfmt(val, dec = 2) {
  if (val == null || isNaN(val)) return 0;
  return parseFloat(val.toFixed(dec));
}

/**
 * createSnapshot(symbol, candles)
 * Generates a standard technical snapshot for analysis and narrative generation.
 * @param {string} symbol
 * @param {Array} candles - Oldest to Newest
 */
function createSnapshot(symbol, candles) {
  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const price   = closes[closes.length - 1];
  
  const rsi     = latestRSI(closes, 14);
  const avgVol  = avgVolume(volumes, 20);
  const volRatio= (avgVol > 0) ? (volumes[volumes.length - 1] / avgVol) : 0;

  return {
    price:        nfmt(price),
    rsi:          nfmt(rsi),
    volume:       volumes[volumes.length - 1],
    volume_ratio: nfmt(volRatio),
    avg_vol_10:   nfmt(avgVolume(volumes, 10), 0),
    avg_vol_30:   nfmt(avgVolume(volumes, 30), 0),
    high_52w:     nfmt(high52Week(closes)),
    low_52w:      nfmt(closes.slice(-252).reduce((min, p) => Math.min(min, p), Infinity)),
    ema: {
      ema10:  nfmt(latestEMA(closes, 10)),
      ema20:  nfmt(latestEMA(closes, 20)),
      ema50:  nfmt(latestEMA(closes, 50)),
      ema100: nfmt(latestEMA(closes, 100)),
      ema200: nfmt(latestEMA(closes, 200))
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = { createSnapshot, nfmt };
