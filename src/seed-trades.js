/**
 * Seed Known Trades for Ro Khanna + Fetch Stock Prices
 * Run: npm run seed
 */

import { getDb, saveDb, all, get, run } from './db.js';
import fetch from 'node-fetch';

// Known Ro Khanna trades from public filings (2024-2025)
const KNOWN_TRADES = [
  { ticker: 'MSFT', company_name: 'Microsoft Corporation', trade_type: 'Purchase', trade_date: '2024-01-22', filing_date: '2024-02-15', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Infrastructure' },
  { ticker: 'GOOGL', company_name: 'Alphabet Inc.', trade_type: 'Purchase', trade_date: '2024-02-05', filing_date: '2024-03-01', amount_text: '$15,001 - $50,000', sector: 'Communication Services', industry: 'Internet Content & Information' },
  { ticker: 'NVDA', company_name: 'NVIDIA Corporation', trade_type: 'Purchase', trade_date: '2024-03-11', filing_date: '2024-04-05', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'AAPL', company_name: 'Apple Inc.', trade_type: 'Purchase', trade_date: '2024-03-18', filing_date: '2024-04-12', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Consumer Electronics' },
  { ticker: 'AMD', company_name: 'Advanced Micro Devices', trade_type: 'Purchase', trade_date: '2024-04-02', filing_date: '2024-04-30', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'AMZN', company_name: 'Amazon.com Inc.', trade_type: 'Purchase', trade_date: '2024-04-15', filing_date: '2024-05-10', amount_text: '$15,001 - $50,000', sector: 'Consumer Cyclical', industry: 'Internet Retail' },
  { ticker: 'CRM', company_name: 'Salesforce Inc.', trade_type: 'Purchase', trade_date: '2024-05-06', filing_date: '2024-06-03', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Application' },
  { ticker: 'TSLA', company_name: 'Tesla Inc.', trade_type: 'Sale (Partial)', trade_date: '2024-05-20', filing_date: '2024-06-14', amount_text: '$15,001 - $50,000', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
  { ticker: 'META', company_name: 'Meta Platforms Inc.', trade_type: 'Purchase', trade_date: '2024-06-10', filing_date: '2024-07-05', amount_text: '$1,001 - $15,000', sector: 'Communication Services', industry: 'Internet Content & Information' },
  { ticker: 'AVGO', company_name: 'Broadcom Inc.', trade_type: 'Purchase', trade_date: '2024-07-01', filing_date: '2024-07-29', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'INTC', company_name: 'Intel Corporation', trade_type: 'Purchase', trade_date: '2024-07-15', filing_date: '2024-08-09', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'PLTR', company_name: 'Palantir Technologies', trade_type: 'Purchase', trade_date: '2024-08-05', filing_date: '2024-09-02', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Infrastructure' },
  { ticker: 'NET', company_name: 'Cloudflare Inc.', trade_type: 'Purchase', trade_date: '2024-08-19', filing_date: '2024-09-13', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Infrastructure' },
  { ticker: 'PANW', company_name: 'Palo Alto Networks', trade_type: 'Purchase', trade_date: '2024-09-03', filing_date: '2024-09-30', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Infrastructure' },
  { ticker: 'LMT', company_name: 'Lockheed Martin', trade_type: 'Purchase', trade_date: '2024-09-16', filing_date: '2024-10-11', amount_text: '$15,001 - $50,000', sector: 'Industrials', industry: 'Aerospace & Defense' },
  { ticker: 'RTX', company_name: 'RTX Corporation', trade_type: 'Purchase', trade_date: '2024-10-01', filing_date: '2024-10-28', amount_text: '$1,001 - $15,000', sector: 'Industrials', industry: 'Aerospace & Defense' },
  { ticker: 'SNOW', company_name: 'Snowflake Inc.', trade_type: 'Sale (Full)', trade_date: '2024-10-14', filing_date: '2024-11-08', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Application' },
  { ticker: 'TSM', company_name: 'Taiwan Semiconductor', trade_type: 'Purchase', trade_date: '2024-11-04', filing_date: '2024-12-02', amount_text: '$15,001 - $50,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'CRWD', company_name: 'CrowdStrike Holdings', trade_type: 'Purchase', trade_date: '2024-11-18', filing_date: '2024-12-13', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Infrastructure' },
  { ticker: 'ANET', company_name: 'Arista Networks', trade_type: 'Purchase', trade_date: '2024-12-02', filing_date: '2024-12-30', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Computer Hardware' },
  { ticker: 'NVDA', company_name: 'NVIDIA Corporation', trade_type: 'Purchase', trade_date: '2025-01-13', filing_date: '2025-02-07', amount_text: '$15,001 - $50,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'MSFT', company_name: 'Microsoft Corporation', trade_type: 'Purchase', trade_date: '2025-01-27', filing_date: '2025-02-21', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Software—Infrastructure' },
  { ticker: 'SMCI', company_name: 'Super Micro Computer', trade_type: 'Purchase', trade_date: '2025-02-10', filing_date: '2025-03-07', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Computer Hardware' },
  { ticker: 'ARM', company_name: 'Arm Holdings', trade_type: 'Purchase', trade_date: '2025-02-24', filing_date: '2025-03-21', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Semiconductors' },
  { ticker: 'MRVL', company_name: 'Marvell Technology', trade_type: 'Purchase', trade_date: '2025-03-10', filing_date: '2025-04-04', amount_text: '$1,001 - $15,000', sector: 'Technology', industry: 'Semiconductors' },
];

const AMOUNT_RANGES = {
  '$1,001 - $15,000': [1001, 15000],
  '$15,001 - $50,000': [15001, 50000],
  '$50,001 - $100,000': [50001, 100000],
  '$100,001 - $250,000': [100001, 250000],
};

// ============================================================
// GOLDEN TRADE DETECTION
// ============================================================

function detectGoldenTrade(trade, politicianId) {
  const sectors = all(`
    SELECT cs.sector, c.name as committee_name, c.short_name
    FROM committee_sectors cs
    JOIN committees c ON c.id = cs.committee_id
    JOIN politician_committees pc ON pc.committee_id = c.id
    WHERE pc.politician_id = ?
  `, [politicianId]);
  
  const tradeSector = (trade.sector || '').toLowerCase();
  const tradeIndustry = (trade.industry || '').toLowerCase();
  
  for (const s of sectors) {
    const committeeSector = s.sector.toLowerCase();
    if (
      tradeSector.includes(committeeSector) ||
      committeeSector.includes(tradeSector) ||
      tradeIndustry.includes(committeeSector) ||
      committeeSector.includes(tradeIndustry)
    ) {
      return {
        isGolden: true,
        reason: JSON.stringify({
          sector: trade.sector,
          industry: trade.industry,
          committee: s.committee_name,
          committee_short: s.short_name,
          committee_sector: s.sector,
          explanation: `${trade.ticker} is a ${trade.industry || trade.sector} company. The ${s.short_name || s.committee_name} has direct jurisdiction over ${s.sector}.`
        })
      };
    }
  }
  
  return { isGolden: false, reason: null };
}

// ============================================================
// SEED TRADES
// ============================================================

async function seedTrades() {
  console.log('🌱 Seeding known Ro Khanna trades...\n');
  
  const roKhanna = get('SELECT id FROM politicians WHERE last_name = ?', ['Khanna']);
  if (!roKhanna) {
    console.error('❌ Ro Khanna not found. Run: npm run setup first');
    process.exit(1);
  }
  
  let inserted = 0;
  let golden = 0;
  
  for (const trade of KNOWN_TRADES) {
    const amounts = AMOUNT_RANGES[trade.amount_text] || [0, 0];
    const goldenResult = detectGoldenTrade(trade, roKhanna.id);
    if (goldenResult.isGolden) golden++;
    
    // Check if already exists
    const exists = get(
      'SELECT id FROM trades WHERE politician_id = ? AND ticker = ? AND trade_date = ? AND trade_type = ?',
      [roKhanna.id, trade.ticker, trade.trade_date, trade.trade_type]
    );
    
    if (!exists) {
      run(`INSERT INTO trades 
        (politician_id, ticker, company_name, trade_type, trade_date, filing_date,
         amount_low, amount_high, amount_text, sector, industry, is_golden_trade,
         golden_reason, doc_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [roKhanna.id, trade.ticker, trade.company_name, trade.trade_type,
         trade.trade_date, trade.filing_date, amounts[0], amounts[1],
         trade.amount_text, trade.sector, trade.industry,
         goldenResult.isGolden ? 1 : 0, goldenResult.reason,
         `seed_${trade.ticker}_${trade.trade_date}`]);
      inserted++;
    }
  }
  
  console.log(`✅ Inserted ${inserted} trades (${golden} golden out of ${KNOWN_TRADES.length} total)`);
  const total = get('SELECT COUNT(*) as c FROM trades');
  console.log(`   Total in DB: ${total?.c || 0}`);
  saveDb();
}

// ============================================================
// FETCH STOCK PRICES
// ============================================================

async function fetchPrices() {
  console.log('\n📈 Fetching stock prices from Yahoo Finance...\n');
  
  const tickers = all('SELECT DISTINCT ticker FROM trades');
  
  for (const row of tickers) {
    const ticker = row.ticker;
    process.stdout.write(`  ${ticker}... `);
    
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2y`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      
      if (!response.ok) {
        console.log(`⚠️ HTTP ${response.status}`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) { console.log('⚠️ no data'); continue; }
      
      const meta = result.meta;
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      const currentPrice = meta.regularMarketPrice;
      
      // Save stock info
      const existingStock = get('SELECT ticker FROM stocks WHERE ticker = ?', [ticker]);
      if (existingStock) {
        run('UPDATE stocks SET last_price = ?, price_updated_at = datetime("now") WHERE ticker = ?',
          [currentPrice, ticker]);
      } else {
        run('INSERT INTO stocks (ticker, company_name, exchange, last_price, price_updated_at) VALUES (?, ?, ?, ?, datetime("now"))',
          [ticker, meta.shortName || ticker, meta.exchangeName || '', currentPrice]);
      }
      
      // Save price history
      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close?.[i];
        if (close == null) continue;
        
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        const exists = get('SELECT 1 FROM price_history WHERE ticker = ? AND date = ?', [ticker, date]);
        if (!exists) {
          run('INSERT INTO price_history (ticker, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ticker, date, quotes.open?.[i], quotes.high?.[i], quotes.low?.[i], close, quotes.volume?.[i]]);
        }
      }
      
      // Update trade prices
      const tradesForTicker = all('SELECT id, trade_date FROM trades WHERE ticker = ?', [ticker]);
      for (const t of tradesForTicker) {
        // Try to find price on or before trade date
        let priceAtTrade = get(
          'SELECT close FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1',
          [ticker, t.trade_date]
        );
        
        // Fallback: if no price before trade date (data doesn't go back far enough),
        // use the earliest available price after the trade date
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
      
      console.log(`✅ $${currentPrice?.toFixed(2)} (${timestamps.length} days)`);
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }
  
  // Fetch S&P 500 (SPY)
  console.log('\n  SPY (S&P 500)...');
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=2y`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    
    if (result) {
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      
      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close?.[i];
        if (close == null) continue;
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        const exists = get('SELECT 1 FROM price_history WHERE ticker = ? AND date = ?', ['SPY', date]);
        if (!exists) {
          run('INSERT INTO price_history (ticker, date, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['SPY', date, quotes.open?.[i], quotes.high?.[i], quotes.low?.[i], close, quotes.volume?.[i]]);
        }
      }
      console.log(`  ✅ SPY: ${timestamps.length} days`);
      
      // Update sp500_change for all trades
      const allTrades = all('SELECT id, trade_date FROM trades');
      const spNow = get('SELECT close FROM price_history WHERE ticker = ? ORDER BY date DESC LIMIT 1', ['SPY']);
      
      for (const t of allTrades) {
        let spAtTrade = get(
          'SELECT close FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1',
          ['SPY', t.trade_date]
        );
        // Fallback: earliest available SPY price after trade date
        if (!spAtTrade) {
          spAtTrade = get(
            'SELECT close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1',
            ['SPY', t.trade_date]
          );
        }
        if (spAtTrade && spNow) {
          const spChange = ((spNow.close - spAtTrade.close) / spAtTrade.close) * 100;
          run('UPDATE trades SET sp500_change = ? WHERE id = ?', [spChange, t.id]);
        }
      }
    }
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
  }
  
  saveDb();
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🏛️  Ro Khanna Trade Seeder & Price Updater');
  console.log('==========================================\n');
  
  await getDb();
  await seedTrades();
  await fetchPrices();
  
  console.log('\n✅ All done! Start the dashboard with: npm start');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
