/**
 * services/narrativeService.js
 * ---------------------------
 * Generates human-like advisory notes for a stock based on technical metrics.
 * Supports AI (OpenAI and OpenRouter) if an API key is provided, otherwise
 * falls back to a rule-based "Smart Advice" engine.
 */

// We use standard fetch now for multi-provider support

/**
 * generateNarrative(symbol, snapshot, signal, userApiKey)
 * ------------------------------------------------------
 * @param {string} symbol
 * @param {object} snapshot - Technical metrics (price, rsi, volume_ratio, etc.)
 * @param {object|null} signal - Detected pattern (if any)
 * @param {string|null} userApiKey - Optional user-provided OpenAI key
 */
async function generateNarrative(symbol, snapshot, signal, userApiKey = null) {
  const apiKey = userApiKey || process.env.OPENAI_API_KEY;

  // 1. If AI Key exists (User provided OR Server provided), use OpenAI
  if (apiKey && (apiKey.startsWith('sk-') || apiKey.length > 20)) {
    try {
      return await getAINarrative(symbol, snapshot, signal, apiKey);
    } catch (err) {
      console.error('[NarrativeService] AI failed, falling back to rules:', err.message);
    }
  }

  // 2. Fallback: Rule-based "Smart Advice" (The "Kell Coach")
  return getRuleBasedAdvice(symbol, snapshot, signal);
}

/**
 * Rule-based fallback engine
 */
function getRuleBasedAdvice(symbol, snapshot, signal) {
  const { rsi, volume_ratio, price, ema } = snapshot;

  // Scenarios
  if (signal) {
    if (signal.quality === 'A+') {
      return `This is a high-conviction "Power Play". The ${signal.signal_type.replace(/_/g, ' ')} is confirmed by massive institutional volume. Focus on tight risk management at the 8% stop level.`;
    }
    return `A valid ${signal.signal_type.replace(/_/g, ' ')} detected. Trend is positive, but ensure you don't chase if it opens more than 3% higher tomorrow.`;
  }

  // Neutral Stock Advice (No signal)
  let advice = '';

  if (rsi > 70) {
    advice = "Stock is currently extended (Overbought). Kell strategy suggests waiting for a 'reset' towards the 10-day or 20-day EMA before considering an entry.";
  } else if (rsi < 45) {
    advice = "Momentum is weak. This stock is currently in a 'Stage 4' or 'Stage 1' phase. Wait for it to clear all major EMAs and show RS improvement.";
  } else if (volume_ratio < 0.8) {
    advice = "Price is stable, but 'quiet'. We need to see a 2x-3x volume surge to confirm that institutions are moving in. Keep on watch for an expansion day.";
  } else {
    advice = "Stock is in a neutral consolidation phase. It meets the trend criteria but lacks a specific Kell trigger. Watch for a price break above the recent tight range.";
  }

  return advice;
}

/**
 * Unified AI Narrative Generator
 * Supports OpenAI and OpenRouter
 */
async function getAINarrative(symbol, snapshot, signal, apiKey) {
  const isOpenRouter = apiKey.startsWith('sk-or-');
  const baseUrl = isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1';
  const model = isOpenRouter ? 'google/gemini-2.0-flash-001' : 'gpt-4o-mini';

  const prompt = `
    Analyze ${symbol} using Oliver Kell's "Power Play" strategy framework. 

    INTERNAL LOGIC CONTEXT:
    This stock was selected because it passed our "Kell Universe" filters:
    - Universe: Price > ₹100, 20d Avg Vol > 500k, RSI > 50, and trending above its EMA20.
    - Software Detection Reasons: ${signal && signal.reasons ? signal.reasons.join(', ') : 'Consolidation watch'}
    - Current Suggestion: ${signal ? signal.action : 'WAIT'} (Pattern: ${signal ? signal.signal_type : 'N/A'})
    - Our technical rank: Grade ${signal ? signal.quality : 'N/A'} (Score: ${signal ? signal.score : 0}/9).

    KELL PROTOCOL REFERENCE:
    - BUY: Base breakout (<5% range for 15d) OR Wedge Pop with 1.5x+ Volume.
    - SELL: Exhaustion (RSI > 75 AND extended 8%+ above EMA10).
    - EXIT: Trend violation (Close below BOTH EMA10 and EMA20).

    DATA SNAPSHOT:
    - Current Price: ₹${snapshot.price}
    - 52-Week High/Low: ₹${snapshot.high_52w} / ₹${snapshot.low_52w}
    - RSI (14): ${snapshot.rsi}
    - Volume Today: ${snapshot.volume}
    - Volume Multiples: vs 10d Avg: ${(snapshot.volume / snapshot.avg_vol_10).toFixed(2)}x, vs 30d Avg: ${(snapshot.volume / snapshot.avg_vol_30).toFixed(2)}x
    - MA Stack: EMA10=₹${snapshot.ema.ema10}, EMA20=₹${snapshot.ema.ema20}, EMA50=₹${snapshot.ema.ema50}, EMA200=₹${snapshot.ema.ema200}
    - Detected Pattern: ${signal ? signal.signal_type : 'Consolidating / Neutral'}

    PLEASE PROVIDE THE ANALYSIS IN THE FOLLOWING STRUCTURE:

    *** IMPORTANT: DO NOT include a fundamental table or Pros/Cons list in the text body below.
    ONLY provide sections 1-7. The system will automatically render stats from your JSON block. ***

    ### 1. THE SETUP (The "Box")
    (Analyze price history and consolidation range)

    ### 2. VOLUME ANALYSIS
    (Verify if this is a 3x+ average volume breakout)

    ### 3. MOVING AVERAGES (Railroad Tracks)
    (Analyze MA alignment and extension from EMA 20)

    ### 4. RELATIVE STRENGTH
    (Analyze distance from 52-week high and trend strength)

    ### 5. KELL SCORECARD
    - [ ] **Base Quality**: ___
    - [ ] **Volume Confirmation**: ___
    - [ ] **MA Alignment**: ___
    - [ ] **Relative Strength**: ___

    ### 6. FINAL VERDICT
    **Power Play?** YES / NO / WATCHLIST
    Entry: ₹___ | Stop: ₹___ | Target: ₹___

    ### 7. POSITION SIZING & RISK
    (Specific sizing %, hard stop levels)

    ---METRICS_START---
    {
      "mcap_cr": number,
      "price_delta_3y": "X%",
      "promoter_delta_3y": "X%",
      "net_profit_cr": number,
      "profit_growth_5y": "X%",
      "sales_growth_5y": "X%",
      "pros": ["bullet", "bullet"],
      "cons": ["bullet", "bullet"]
    }
    ---METRICS_END---

    Tone: Quant-grade, decisive, professional trader style. 
    Constraint: Keep it concise but information-dense.
  `;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://ok-momentum-screener.local',
        'X-Title': 'OK Momentum Screener'
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content || content.length < 10) {
      console.warn('[NarrativeService] AI returned empty/invalid response. Falling back.');
      return { advice: getRuleBasedAdvice(symbol, snapshot, signal), fundamentals: null };
    }

    // Extract JSON metrics if present
    const metricsMatch = content.match(/---METRICS_START---([\s\S]+?)---METRICS_END---/);
    let fundamentals = null;
    let advice = content;

    if (metricsMatch) {
      try {
        fundamentals = JSON.parse(metricsMatch[1].trim());
        // Clean the display text
        advice = content.replace(/---METRICS_START---[\s\S]+?---METRICS_END---/, '').trim();
      } catch (err) {
        console.warn('[NarrativeService] Failed to parse metrics JSON:', err.message);
      }
    }

    return { advice, fundamentals };
  } catch (err) {
    console.error('[NarrativeService] AI Request failed:', err.message);
    return { advice: getRuleBasedAdvice(symbol, snapshot, signal), fundamentals: null };
  }
}

module.exports = { generateNarrative };
