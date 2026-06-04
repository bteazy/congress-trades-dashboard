/**
 * Fetch/Update Stock Prices from Yahoo Finance (FREE, no API key needed)
 * 
 * Strategy for zero-cost daily updates:
 * - Yahoo Finance chart API is free and requires no authentication
 * - Rate limit: ~2000 requests/hour (we add 500ms delay between requests)
 * - Runs via GitHub Actions cron (free for public repos)
 * - Only fetches prices for tickers that have trades in the last 365 days
 */

import { getDb, saveDb, all, get, run } from '../src/db.js';
import fetch from 'node-fetch';

const YAHOO_DELAY_MS = 600; // Delay between requests to avoid rate limiting
const PRICE_RANGE = '1y'; // 1 year of daily price history

// ============================================================
// FETCH PRICE FOR SINGLE TICKER
// ============================================================

async function fetchTickerPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${PRICE_RANGE}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('RATE_LIMITED');
    return null;
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};

  return {
    currentPrice: meta.regularMarketPrice,
    shortName: meta.shortName || ticker,
    exchange: meta.exchangeName || '',
    timestamps,
    quotes
  };
}

// ============================================================
// UPDATE PRICES FOR ALL ACTIVE TICKERS
// ============================================================

async function updatePrices() {
  console.log('📈 Fetching stock prices from Yahoo Finance...\n');

  // Get all unique tickers from trades in the last 365 days
  const tickers = all(`
    SELECT DISTINCT ticker FROM trades 
    WHERE ticker IS NOT NULL 
    AND ticker != '' 
    AND trade_date >= date('now', '-365 days')
    ORDER BY ticker
  `);

  // Also always include SPY for S&P 500 comparison
  const allTickers = [...new Set([...tickers.map(t => t.ticker), 'SPY'])];
  
  console.log(`  📊 ${allTickers.length} tickers to update\n`);

  let updated = 0;
  let failed = 0;
  let rateLimited = false;

  for (const ticker of allTickers) {
    if (rateLimited) break;
    
    process.stdout.write(`  ${ticker}... `);
    
    try {
      const data = await fetchTickerPrice(ticker);
      
      if (!data) {
        console.log('⚠️ no data');
        failed++;
        continue;
      }

      const { currentPrice, shortName, exchange, timestamps, quotes } = data;

      // Update stocks table
      const existingStock = get('SELECT ticker FROM stocks WHERE ticker = ?', [ticker]);
      if (existingStock) {
        run('UPDATE stocks SET last_price = ?, company_name = ?, exchange = ?, price_updated_at = datetime("now") WHERE ticker = ?',
          [currentPrice, shortName, exchange, ticker]);
      } else {
        run('INSERT INTO stocks (ticker, company_name, exchange, last_price, price_updated_at) VALUES (?, ?, ?, ?, datetime("now"))',
          [ticker, shortName, exchange, currentPrice]);
      }

      // Save price history (only new dates)
      let newDays = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close?.[i];
        if (close == null) continue;
        
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        if (!get('SELECT 1 FROM price_history WHERE ticker = ? AND date = ?', [ticker, date])) {
          run('INSERT INTO price_history (ticker, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ticker, date, quotes.open?.[i], quotes.high?.[i], quotes.low?.[i], close, quotes.volume?.[i]]);
          newDays++;
        }
      }

      // Update trade prices for this ticker (skip SPY)
      if (ticker !== 'SPY') {
        const tradesForTicker = all('SELECT id, trade_date FROM trades WHERE ticker = ?', [ticker]);
        for (const t of tradesForTicker) {
          let priceAtTrade = get(
            'SELECT close FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1',
            [ticker, t.trade_date]
          );
          // Fallback: earliest available price after trade date
          if (!priceAtTrade) {
            priceAtTrade = get(
              'SELECT close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1',
              [ticker, t.trade_date]
            );
          }
          if (priceAtTrade && currentPrice) {
            const pctChange = ((currentPrice - priceAtTrade.close) / priceAtTrade.close) * 100;
            run('UPDATE trades SET price_at_trade = ?, price_current = ?, percent_change = ?, price_updated_at = datetime("now") WHERE id = ?',
              [priceAtTrade.close, currentPrice, pctChange, t.id]);
          }
        }
      }

      console.log(`✅ $${currentPrice?.toFixed(2)} (+${newDays} days)`);
      updated++;
      
      await new Promise(r => setTimeout(r, YAHOO_DELAY_MS));
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        console.log('🚫 Rate limited! Stopping.');
        rateLimited = true;
      } else {
        console.log(`❌ ${err.message}`);
        failed++;
      }
    }
  }

  // Update S&P 500 comparison for all trades
  console.log('\n  📊 Updating S&P 500 comparisons...');
  const spNow = get('SELECT close FROM price_history WHERE ticker = ? ORDER BY date DESC LIMIT 1', ['SPY']);
  
  if (spNow) {
    const allTrades = all('SELECT id, trade_date FROM trades WHERE trade_date >= date("now", "-365 days")');
    for (const t of allTrades) {
      let spAtTrade = get(
        'SELECT close FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1',
        ['SPY', t.trade_date]
      );
      if (!spAtTrade) {
        spAtTrade = get(
          'SELECT close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1',
          ['SPY', t.trade_date]
        );
      }
      if (spAtTrade) {
        const spChange = ((spNow.close - spAtTrade.close) / spAtTrade.close) * 100;
        run('UPDATE trades SET sp500_change = ? WHERE id = ?', [spChange, t.id]);
      }
    }
    console.log('  ✅ S&P 500 comparisons updated');
  }

  saveDb();
  
  console.log(`\n📊 Results: ${updated} updated, ${failed} failed`);
  if (rateLimited) {
    console.log('⚠️ Rate limited - run again later for remaining tickers');
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('💰 Price Updater v2.0');
  console.log('=====================\n');
  
  await getDb();
  await updatePrices();
  
  console.log('\n✅ Price update complete!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
