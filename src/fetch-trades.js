/**
 * Trade Fetcher - Downloads and parses House Clerk PTR filings
 * Fetches stock prices from Yahoo Finance
 * Run: npm run fetch
 */

import Database from 'better-sqlite3';
import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', 'data', 'trades.db');
const CACHE_DIR = join(__dirname, '..', 'data', 'cache');

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============================================================
// CONFIGURATION
// ============================================================

const TARGET_POLITICIANS = ['Khanna']; // MVP: Ro Khanna only
const YEARS_TO_FETCH = [2024, 2025]; // Recent years
const HOUSE_CLERK_BASE = 'https://disclosures-clerk.house.gov/public_disc/financial-pdfs';

// Amount range mapping from House Clerk codes
const AMOUNT_RANGES = {
  '$1,001 - $15,000': [1001, 15000],
  '$15,001 - $50,000': [15001, 50000],
  '$50,001 - $100,000': [50001, 100000],
  '$100,001 - $250,000': [100001, 250000],
  '$250,001 - $500,000': [250001, 500000],
  '$500,001 - $1,000,000': [500001, 1000000],
  '$1,000,001 - $5,000,000': [1000001, 5000000],
  '$5,000,001 - $25,000,000': [5000001, 25000000],
  '$25,000,001 - $50,000,000': [25000001, 50000000],
  'Over $50,000,000': [50000001, 100000000],
};

// ============================================================
// HOUSE CLERK XML FETCHER
// ============================================================

async function fetchYearIndex(year) {
  const cacheFile = join(CACHE_DIR, `${year}FD.xml`);
  
  // Check cache (refresh daily)
  if (existsSync(cacheFile)) {
    const stats = statSync(cacheFile);
    const hoursSinceModified = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    if (hoursSinceModified < 24) {
      console.log(`  Using cached XML for ${year}`);
      return readFileSync(cacheFile, 'utf-8');
    }
  }

  const url = `${HOUSE_CLERK_BASE}/${year}FD.xml`;
  console.log(`  Fetching: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'CongressTradesDashboard/1.0' }
    });
    
    if (!response.ok) {
      console.warn(`  ⚠️ Failed to fetch ${year} index: ${response.status}`);
      return null;
    }
    
    const xml = await response.text();
    writeFileSync(cacheFile, xml);
    return xml;
  } catch (err) {
    console.error(`  ❌ Error fetching ${year}:`, err.message);
    return null;
  }
}

async function parseFilings(xml, year) {
  const result = await parseStringPromise(xml, { explicitArray: false });
  const members = result?.FinancialDisclosure?.Member;
  
  if (!members) return [];
  
  const memberList = Array.isArray(members) ? members : [members];
  
  // Filter for PTRs (Periodic Transaction Reports) from target politicians
  const filings = memberList.filter(m => {
    const isPTR = m.FilingType === 'P'; // P = Periodic Transaction Report
    const isTarget = TARGET_POLITICIANS.some(name => 
      (m.Last || '').toLowerCase().includes(name.toLowerCase())
    );
    return isPTR && isTarget;
  });

  return filings.map(m => ({
    docId: m.DocID,
    prefix: m.Prefix || '',
    first: m.First || '',
    last: m.Last || '',
    suffix: m.Suffix || '',
    filingType: m.FilingType,
    stateDst: m.StateDst || '',
    year: m.Year || year,
    filingDate: m.FilingDate || '',
    pdfUrl: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${m.DocID}.pdf`
  }));
}

// ============================================================
// PDF PARSER (extracts trades from PTR PDFs)
// ============================================================

async function parsePTRPdf(filing) {
  // For MVP, we'll use a structured approach:
  // The House Clerk also provides some data in the XML itself for newer filings
  // For older ones, we'd need PDF parsing (pdf-parse library)
  // 
  // Alternative: Use the structured data from capitol-api or parse the XML amendments
  
  console.log(`  📄 Filing ${filing.docId} from ${filing.first} ${filing.last} (${filing.filingDate})`);
  
  // Try to fetch and parse the PDF
  try {
    const response = await fetch(filing.pdfUrl, {
      headers: { 'User-Agent': 'CongressTradesDashboard/1.0' }
    });
    
    if (!response.ok) {
      console.warn(`    ⚠️ Could not fetch PDF: ${response.status}`);
      return [];
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Dynamic import for pdf-parse
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;
    
    // Parse the PDF text for trade entries
    return extractTradesFromText(text, filing);
  } catch (err) {
    console.warn(`    ⚠️ PDF parse error: ${err.message}`);
    return [];
  }
}

function extractTradesFromText(text, filing) {
  const trades = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // PTR PDFs have a table format. Common patterns:
  // Asset: [Company Name] ([Ticker])
  // Transaction Type: Purchase/Sale
  // Date: MM/DD/YYYY
  // Amount: $X - $Y
  
  let currentTrade = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for ticker patterns like (AAPL) or [AAPL]
    const tickerMatch = line.match(/\(([A-Z]{1,5})\)|\[([A-Z]{1,5})\]/);
    if (tickerMatch) {
      if (currentTrade.ticker) {
        trades.push({ ...currentTrade });
      }
      currentTrade = {
        ticker: tickerMatch[1] || tickerMatch[2],
        company_name: line.split(/[\(\[]/)[0].trim(),
        filing_date: filing.filingDate,
        doc_id: filing.docId,
        filing_url: filing.pdfUrl
      };
    }
    
    // Transaction type
    if (/purchase/i.test(line) && currentTrade.ticker) {
      currentTrade.trade_type = 'Purchase';
    } else if (/sale.*full/i.test(line) && currentTrade.ticker) {
      currentTrade.trade_type = 'Sale (Full)';
    } else if (/sale.*partial/i.test(line) && currentTrade.ticker) {
      currentTrade.trade_type = 'Sale (Partial)';
    } else if (/sale/i.test(line) && !currentTrade.trade_type && currentTrade.ticker) {
      currentTrade.trade_type = 'Sale';
    }
    
    // Date pattern MM/DD/YYYY
    const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (dateMatch && currentTrade.ticker && !currentTrade.trade_date) {
      currentTrade.trade_date = dateMatch[1];
    }
    
    // Amount pattern
    const amountMatch = line.match(/\$[\d,]+ - \$[\d,]+|\$[\d,]+\s*-\s*\$[\d,]+/);
    if (amountMatch && currentTrade.ticker) {
      currentTrade.amount_text = amountMatch[0].replace(/\s+/g, ' ');
    }
  }
  
  // Don't forget last trade
  if (currentTrade.ticker) {
    trades.push({ ...currentTrade });
  }
  
  return trades.filter(t => t.ticker && t.trade_type);
}

// ============================================================
// YAHOO FINANCE PRICE FETCHER
// ============================================================

async function fetchStockPrice(ticker) {
  try {
    // Yahoo Finance v8 chart API (free, no key needed)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    
    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    
    return {
      ticker,
      company_name: meta.shortName || meta.longName || ticker,
      exchange: meta.exchangeName,
      current_price: meta.regularMarketPrice,
      history: timestamps.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split('T')[0],
        open: quotes.open?.[i],
        high: quotes.high?.[i],
        low: quotes.low?.[i],
        close: quotes.close?.[i],
        volume: quotes.volume?.[i]
      })).filter(d => d.close != null)
    };
  } catch (err) {
    console.warn(`  ⚠️ Price fetch failed for ${ticker}:`, err.message);
    return null;
  }
}

async function fetchStockInfo(ticker) {
  try {
    // Use Yahoo Finance quoteSummary for sector/industry info
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile,price`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const profile = data?.quoteSummary?.result?.[0]?.assetProfile;
    const price = data?.quoteSummary?.result?.[0]?.price;
    
    return {
      sector: profile?.sector || '',
      industry: profile?.industry || '',
      company_name: price?.shortName || price?.longName || ticker,
      exchange: price?.exchangeName || ''
    };
  } catch (err) {
    return null;
  }
}

async function fetchSP500History(range = '1y') {
  return fetchStockPrice('^GSPC');
}

// ============================================================
// GOLDEN TRADE DETECTION
// ============================================================

function detectGoldenTrade(trade, politicianId) {
  const sectors = db.prepare(`
    SELECT cs.sector, c.name as committee_name, c.short_name
    FROM committee_sectors cs
    JOIN committees c ON c.id = cs.committee_id
    JOIN politician_committees pc ON pc.committee_id = c.id
    WHERE pc.politician_id = ?
  `).all(politicianId);
  
  if (!trade.sector) return { isGolden: false, reason: null };
  
  const tradeSector = trade.sector.toLowerCase();
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
          committee_sector: s.sector,
          explanation: `${trade.ticker} is a ${trade.industry || trade.sector} company. The ${s.short_name || s.committee_name} has direct jurisdiction over ${s.sector}.`
        })
      };
    }
  }
  
  return { isGolden: false, reason: null };
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

function saveTrade(trade, politicianId) {
  const amounts = AMOUNT_RANGES[trade.amount_text] || [0, 0];
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO trades 
    (politician_id, ticker, company_name, trade_type, trade_date, filing_date,
     amount_low, amount_high, amount_text, sector, industry, is_golden_trade,
     golden_reason, price_at_trade, filing_url, doc_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Normalize date format
  let tradeDate = trade.trade_date;
  if (tradeDate && tradeDate.includes('/')) {
    const [m, d, y] = tradeDate.split('/');
    tradeDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  
  let filingDate = trade.filing_date;
  if (filingDate && filingDate.includes('/')) {
    const [m, d, y] = filingDate.split('/');
    filingDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  
  const golden = detectGoldenTrade(trade, politicianId);
  
  try {
    stmt.run(
      politicianId,
      trade.ticker,
      trade.company_name || '',
      trade.trade_type || 'Purchase',
      tradeDate || '',
      filingDate || '',
      amounts[0],
      amounts[1],
      trade.amount_text || '',
      trade.sector || '',
      trade.industry || '',
      golden.isGolden ? 1 : 0,
      golden.reason,
      trade.price_at_trade || null,
      trade.filing_url || '',
      trade.doc_id || ''
    );
    return true;
  } catch (err) {
    if (!err.message.includes('UNIQUE')) {
      console.warn(`    ⚠️ DB error: ${err.message}`);
    }
    return false;
  }
}

function saveStockData(stockData) {
  if (!stockData) return;
  
  const upsertStock = db.prepare(`
    INSERT OR REPLACE INTO stocks (ticker, company_name, sector, industry, exchange, last_price, price_updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  upsertStock.run(
    stockData.ticker,
    stockData.company_name || '',
    stockData.sector || '',
    stockData.industry || '',
    stockData.exchange || '',
    stockData.current_price || null
  );
  
  // Save price history
  if (stockData.history) {
    const insertPrice = db.prepare(`
      INSERT OR REPLACE INTO price_history (ticker, date, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertMany = db.transaction((prices) => {
      for (const p of prices) {
        insertPrice.run(stockData.ticker, p.date, p.open, p.high, p.low, p.close, p.volume);
      }
    });
    
    insertMany(stockData.history);
  }
}

// ============================================================
// MAIN FETCH ROUTINE
// ============================================================

async function main() {
  console.log('🏛️  Congressional Trades Fetcher');
  console.log('================================\n');
  
  const roKhanna = db.prepare('SELECT id FROM politicians WHERE last_name = ?').get('Khanna');
  if (!roKhanna) {
    console.error('❌ Ro Khanna not found in DB. Run: npm run setup');
    process.exit(1);
  }
  
  let totalNew = 0;
  
  // Step 1: Fetch House Clerk XML indexes
  console.log('📥 Step 1: Fetching House Clerk filing indexes...');
  for (const year of YEARS_TO_FETCH) {
    console.log(`\n  Year ${year}:`);
    const xml = await fetchYearIndex(year);
    if (!xml) continue;
    
    const filings = await parseFilings(xml, year);
    console.log(`  Found ${filings.length} PTR filings for target politicians`);
    
    // Step 2: Parse each filing PDF
    for (const filing of filings) {
      const trades = await parsePTRPdf(filing);
      console.log(`    → ${trades.length} trades extracted`);
      
      for (const trade of trades) {
        // Get stock info (sector/industry) for Golden Trade detection
        const stockInfo = await fetchStockInfo(trade.ticker);
        if (stockInfo) {
          trade.sector = stockInfo.sector;
          trade.industry = stockInfo.industry;
          trade.company_name = trade.company_name || stockInfo.company_name;
        }
        
        if (saveTrade(trade, roKhanna.id)) {
          totalNew++;
        }
        
        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  
  // Step 3: Update stock prices for all tickers in DB
  console.log('\n📈 Step 3: Fetching stock prices...');
  const tickers = db.prepare('SELECT DISTINCT ticker FROM trades').all();
  
  for (const { ticker } of tickers) {
    console.log(`  ${ticker}...`);
    const stockData = await fetchStockPrice(ticker);
    if (stockData) {
      saveStockData(stockData);
      
      // Update trade prices
      const latestPrice = stockData.current_price;
      const history = stockData.history;
      
      // Get trades for this ticker to update price_at_trade
      const tradesForTicker = db.prepare(
        'SELECT id, trade_date FROM trades WHERE ticker = ? AND price_at_trade IS NULL'
      ).all(ticker);
      
      for (const t of tradesForTicker) {
        // Find closest price to trade date
        const closest = history.reduce((best, h) => {
          const diff = Math.abs(new Date(h.date) - new Date(t.trade_date));
          return diff < best.diff ? { price: h.close, diff } : best;
        }, { price: null, diff: Infinity });
        
        if (closest.price) {
          db.prepare('UPDATE trades SET price_at_trade = ? WHERE id = ?').run(closest.price, t.id);
        }
      }
      
      // Update current price and percent change
      if (latestPrice) {
        db.prepare(`
          UPDATE trades 
          SET price_current = ?, 
              price_updated_at = datetime('now'),
              percent_change = CASE WHEN price_at_trade > 0 
                THEN ((? - price_at_trade) / price_at_trade) * 100 
                ELSE NULL END
          WHERE ticker = ?
        `).run(latestPrice, latestPrice, ticker);
      }
    }
    
    // Rate limit Yahoo Finance
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Step 4: Fetch S&P 500 for comparison
  console.log('\n📊 Step 4: Fetching S&P 500 data...');
  const sp500Data = await fetchSP500History();
  if (sp500Data) {
    saveStockData({ ...sp500Data, ticker: 'SPY' });
  }
  
  console.log(`\n✅ Done! ${totalNew} new trades added.`);
  console.log(`   Total trades in DB: ${db.prepare('SELECT COUNT(*) as c FROM trades').get().c}`);
  
  db.close();
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  db.close();
  process.exit(1);
});
