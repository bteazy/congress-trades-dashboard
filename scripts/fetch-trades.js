/**
 * Fetch ALL congressional trades from free public sources:
 * 1. House Stock Watcher S3 dataset (free, all House trades since 2020)
 * 2. Senate EFD via CongressInvests API (free tier, 100 req/day)
 * 
 * Filters OUT: ETFs, Crypto, Money Market Funds
 * Keeps: Stocks, Stock Options, Corporate Bonds, Municipal Bonds
 */

import { getDb, saveDb, all, get, run } from '../src/db.js';
import fetch from 'node-fetch';

const HOUSE_DATA_URL = 'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';

// Asset types to EXCLUDE
const EXCLUDED_TYPES = ['ETF', 'Cryptocurrency', 'Money Market', 'Mutual Fund'];
const EXCLUDED_TICKERS = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA'];

// Known ETF tickers to filter
const ETF_TICKERS = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'VEA', 'VWO', 'BND', 'AGG',
  'GLD', 'SLV', 'TLT', 'HYG', 'LQD', 'EFA', 'EEM', 'XLF', 'XLK', 'XLE',
  'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'ARKK', 'ARKG',
  'ARKW', 'ARKF', 'ARKQ', 'IBIT', 'FBTC', 'GBTC', 'ETHE', 'VGT', 'SCHD',
  'JEPI', 'JEPQ', 'VYM', 'DVY', 'HDV', 'NOBL', 'VIG', 'DGRO',
]);

// ============================================================
// POLITICIAN MANAGEMENT
// ============================================================

function getOrCreatePolitician(name, party, state, district, chamber) {
  // Parse name
  const parts = name.trim().split(/\s+/);
  let firstName, lastName;
  
  if (parts.length >= 2) {
    // Handle "Last, First" format
    if (parts[0].endsWith(',')) {
      lastName = parts[0].replace(',', '');
      firstName = parts.slice(1).join(' ');
    } else {
      firstName = parts[0];
      lastName = parts[parts.length - 1];
    }
  } else {
    firstName = '';
    lastName = name;
  }

  const fullName = `${firstName} ${lastName}`.trim();
  
  // Check if exists
  let politician = get(
    'SELECT id FROM politicians WHERE last_name = ? AND first_name = ? AND chamber = ?',
    [lastName, firstName, chamber]
  );
  
  if (!politician) {
    // Try by full name
    politician = get('SELECT id FROM politicians WHERE full_name = ?', [fullName]);
  }

  if (!politician) {
    run(`INSERT INTO politicians (first_name, last_name, full_name, party, state, district, chamber)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, fullName, party || '', state || '', district || '', chamber]);
    politician = get('SELECT id FROM politicians WHERE rowid = last_insert_rowid()');
  }

  return politician?.id;
}

// ============================================================
// DETERMINE ASSET TYPE
// ============================================================

function classifyAsset(assetName, ticker, assetType) {
  const name = (assetName || '').toLowerCase();
  const type = (assetType || '').toLowerCase();
  
  // Explicit exclusions
  if (ETF_TICKERS.has(ticker)) return 'ETF';
  if (EXCLUDED_TICKERS.includes(ticker)) return 'Cryptocurrency';
  if (type.includes('etf') || name.includes('etf') || name.includes('exchange traded')) return 'ETF';
  if (type.includes('crypto') || name.includes('bitcoin') || name.includes('ethereum')) return 'Cryptocurrency';
  if (name.includes('money market') || name.includes('mmkt')) return 'Money Market';
  if (name.includes('mutual fund') || type === 'mf') return 'Mutual Fund';
  
  // Inclusions
  if (type.includes('option') || name.includes('call option') || name.includes('put option') || type === 'op') return 'Stock Option';
  if (type.includes('bond') || name.includes('bond') || name.includes('note') || type === 'cb') return 'Corporate Bond';
  if (name.includes('municipal') || type === 'mb') return 'Municipal Bond';
  if (type === 'st' || type.includes('stock') || ticker) return 'Stock';
  
  return 'Other';
}

function shouldInclude(assetType) {
  return !EXCLUDED_TYPES.includes(assetType);
}

// ============================================================
// NORMALIZE TRADE TYPE
// ============================================================

function normalizeTradeType(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('purchase') || t === 'p' || t === 'buy') return 'Purchase';
  if (t.includes('sale_full') || t.includes('sale (full)')) return 'Sale (Full)';
  if (t.includes('sale_partial') || t.includes('sale (partial)')) return 'Sale (Partial)';
  if (t.includes('sale') || t === 's' || t === 'sell') return 'Sale';
  if (t.includes('exchange') || t === 'e') return 'Exchange';
  return type || 'Unknown';
}

// ============================================================
// PARSE AMOUNT RANGE
// ============================================================

function parseAmount(amountStr) {
  if (!amountStr) return { low: 0, high: 0, text: '' };
  
  const ranges = {
    '$1,001 - $15,000': { low: 1001, high: 15000 },
    '$15,001 - $50,000': { low: 15001, high: 50000 },
    '$50,001 - $100,000': { low: 50001, high: 100000 },
    '$100,001 - $250,000': { low: 100001, high: 250000 },
    '$250,001 - $500,000': { low: 250001, high: 500000 },
    '$500,001 - $1,000,000': { low: 500001, high: 1000000 },
    '$1,000,001 - $5,000,000': { low: 1000001, high: 5000000 },
    '$5,000,001 - $25,000,000': { low: 5000001, high: 25000000 },
    '$25,000,001 - $50,000,000': { low: 25000001, high: 50000000 },
    'Over $50,000,000': { low: 50000001, high: 100000000 },
  };
  
  for (const [key, val] of Object.entries(ranges)) {
    if (amountStr.includes(key) || amountStr === key) {
      return { ...val, text: key };
    }
  }
  
  return { low: 0, high: 0, text: amountStr };
}

// ============================================================
// GOLDEN TRADE DETECTION
// ============================================================

function detectGoldenTrade(ticker, sector, industry, politicianId) {
  if (!ticker || !politicianId) return { isGolden: false, reason: null };
  
  const sectors = all(`
    SELECT cs.sector, c.name as committee_name, c.short_name
    FROM committee_sectors cs
    JOIN committees c ON c.id = cs.committee_id
    JOIN politician_committees pc ON pc.committee_id = c.id
    WHERE pc.politician_id = ?
  `, [politicianId]);

  if (sectors.length === 0) return { isGolden: false, reason: null };

  const tradeSector = (sector || '').toLowerCase();
  const tradeIndustry = (industry || '').toLowerCase();

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
          sector, industry,
          committee: s.committee_name,
          committee_short: s.short_name,
          committee_sector: s.sector,
          explanation: `${ticker} is in ${industry || sector}. ${s.short_name} has jurisdiction over ${s.sector}.`
        })
      };
    }
  }

  return { isGolden: false, reason: null };
}

// ============================================================
// FETCH HOUSE TRADES (Stock Watcher S3)
// ============================================================

async function fetchHouseTrades() {
  console.log('🏛️  Fetching House trades from Stock Watcher...');
  
  let response;
  try {
    response = await fetch(HOUSE_DATA_URL, {
      headers: { 'User-Agent': 'CongressTradesDashboard/2.0' }
    });
  } catch (err) {
    console.log(`  ⚠️ Could not reach House Stock Watcher: ${err.message}`);
    return 0;
  }

  if (!response.ok) {
    console.log(`  ⚠️ HTTP ${response.status} from House Stock Watcher`);
    return 0;
  }

  const trades = await response.json();
  console.log(`  📥 Downloaded ${trades.length} total House transactions`);

  let inserted = 0;
  let skipped = 0;
  let golden = 0;

  for (const t of trades) {
    const ticker = (t.ticker || '').toUpperCase().replace('--', '').trim();
    const assetType = classifyAsset(t.asset_description, ticker, t.type);
    
    if (!shouldInclude(assetType)) {
      skipped++;
      continue;
    }

    // Skip if no meaningful data
    if (!ticker && !t.asset_description) continue;

    const tradeType = normalizeTradeType(t.type);
    const tradeDate = t.transaction_date || '';
    const filingDate = t.disclosure_date || '';
    const docId = `house_${(t.representative || '').replace(/\s/g, '_')}_${ticker || 'NA'}_${tradeDate}`;

    // Check if exists
    if (get('SELECT 1 FROM trades WHERE doc_id = ?', [docId])) continue;

    // Get or create politician
    const politicianId = getOrCreatePolitician(
      t.representative || 'Unknown',
      t.party || '',
      t.state || '',
      t.district || '',
      'House'
    );

    const amount = parseAmount(t.amount);
    
    // Golden trade detection
    const { isGolden, reason } = detectGoldenTrade(ticker, t.sector || '', t.industry || '', politicianId);
    if (isGolden) golden++;

    run(`INSERT INTO trades (politician_id, ticker, asset_name, asset_type, trade_type, 
         trade_date, filing_date, disclosure_date, amount_low, amount_high, amount_text,
         sector, industry, is_golden_trade, golden_reason, filing_url, doc_id, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [politicianId, ticker || null, t.asset_description || '', assetType, tradeType,
       tradeDate, filingDate, filingDate, amount.low, amount.high, amount.text,
       t.sector || '', t.industry || '', isGolden ? 1 : 0, reason,
       t.ptr_link || null, docId, 'house_stockwatcher']);
    
    inserted++;
  }

  console.log(`  ✅ Inserted ${inserted} House trades (${golden} golden, ${skipped} filtered out)`);
  return inserted;
}

// ============================================================
// FETCH SENATE TRADES (CongressInvests API - free tier)
// ============================================================

async function fetchAllTrades() {
  console.log('\n🏛️  Fetching ALL trades from CongressInvests API (House + Senate)...');
  
  let allTrades = [];
  let offset = 0;
  const pageSize = 200;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(`https://congressinfor-production.up.railway.app/trades?limit=${pageSize}&offset=${offset}`, {
        headers: { 'User-Agent': 'CongressTradesDashboard/2.0' }
      });

      if (!response.ok) {
        console.log(`  ⚠️ HTTP ${response.status} at offset ${offset}`);
        break;
      }

      const data = await response.json();
      const trades = data.trades || [];
      allTrades = allTrades.concat(trades);
      hasMore = data.has_more === true;
      offset += pageSize;

      process.stdout.write(`  📥 ${allTrades.length}/${data.total || '?'} trades downloaded\r`);
      
      // Rate limit: stay under 100 req/day free tier
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.log(`  ⚠️ Error at offset ${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`\n  📥 Downloaded ${allTrades.length} total transactions`);

  let inserted = 0;
  let skipped = 0;

  for (const t of allTrades) {
    const ticker = (t.ticker || '').toUpperCase().trim();
    const assetName = t.asset || t.asset_name || '';
    const assetType = classifyAsset(assetName, ticker, '');
    
    if (!shouldInclude(assetType)) {
      skipped++;
      continue;
    }

    if (!ticker && !assetName) continue;

    const tradeType = normalizeTradeType(t.trade_type || t.type || '');
    const tradeDate = t.tx_date || t.transaction_date || t.trade_date || '';
    const filingDate = t.disclosed || t.disclosure_date || t.filing_date || '';
    const memberName = t.member || t.senator || t.politician || 'Unknown';
    const chamber = t.chamber || 'House';
    const docId = `ci_${memberName.replace(/\s/g, '_')}_${ticker || 'NA'}_${tradeDate}_${tradeType}`;

    if (get('SELECT 1 FROM trades WHERE doc_id = ?', [docId])) continue;

    const politicianId = getOrCreatePolitician(memberName, '', '', '', chamber);
    const amount = parseAmount(t.amount || '');
    const { isGolden, reason } = detectGoldenTrade(ticker, '', '', politicianId);
    if (isGolden) inserted; // just for counting

    run(`INSERT INTO trades (politician_id, ticker, asset_name, asset_type, trade_type,
         trade_date, filing_date, disclosure_date, amount_low, amount_high, amount_text,
         sector, industry, is_golden_trade, golden_reason, filing_url, doc_id, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [politicianId, ticker || null, assetName, assetType, tradeType,
       tradeDate, filingDate, filingDate, amount.low, amount.high, amount.text,
       '', '', isGolden ? 1 : 0, reason, t.link || null, docId, 'congressinvests']);

    inserted++;
  }

  console.log(`  ✅ Inserted ${inserted} trades (${skipped} filtered out)`);
  return inserted;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🏛️  Congressional Trades Fetcher v2.0');
  console.log('=====================================\n');

  await getDb();

  const houseTrades = await fetchHouseTrades();
  const allTrades = await fetchAllTrades();

  // Summary
  const totalTrades = get('SELECT COUNT(*) as c FROM trades');
  const totalPoliticians = get('SELECT COUNT(*) as c FROM politicians');
  const goldenTrades = get('SELECT COUNT(*) as c FROM trades WHERE is_golden_trade = 1');

  console.log('\n=====================================');
  console.log(`📊 Summary:`);
  console.log(`   Total trades in DB: ${totalTrades?.c || 0}`);
  console.log(`   Total politicians: ${totalPoliticians?.c || 0}`);
  console.log(`   Golden trades: ${goldenTrades?.c || 0}`);
  console.log(`   New this run: ${houseTrades + allTrades}`);

  saveDb();
  console.log('\n✅ Done!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
