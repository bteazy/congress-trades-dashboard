/**
 * ALL-IN-ONE Setup Script
 * Erstellt die Datenbank, seedet Trades, holt Preise, startet den Server
 * 
 * Nutzung: node setup-all.js
 */

import { getDb, saveDb, exec, run, get, all, getDbPath } from './src/db.js';
import fetch from 'node-fetch';

// ============================================================
// STEP 1: DATABASE SETUP
// ============================================================

async function setupDatabase() {
  console.log('\n📊 Schritt 1: Datenbank erstellen...');
  await getDb();
  
  exec(`
    CREATE TABLE IF NOT EXISTS politicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      full_name TEXT NOT NULL, party TEXT, state TEXT, district TEXT, chamber TEXT DEFAULT 'House',
      photo_url TEXT, twitter_handle TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS committees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, short_name TEXT, chamber TEXT DEFAULT 'House'
    );
    CREATE TABLE IF NOT EXISTS politician_committees (
      politician_id INTEGER, committee_id INTEGER, role TEXT, PRIMARY KEY (politician_id, committee_id)
    );
    CREATE TABLE IF NOT EXISTS committee_sectors (
      committee_id INTEGER, sector TEXT NOT NULL, PRIMARY KEY (committee_id, sector)
    );
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, politician_id INTEGER, ticker TEXT NOT NULL,
      company_name TEXT, trade_type TEXT NOT NULL, trade_date DATE NOT NULL, filing_date DATE NOT NULL,
      amount_low REAL, amount_high REAL, amount_text TEXT, sector TEXT, industry TEXT,
      is_golden_trade INTEGER DEFAULT 0, golden_reason TEXT, price_at_trade REAL, price_current REAL,
      price_updated_at DATETIME, percent_change REAL, sp500_change REAL, filing_url TEXT, doc_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS stocks (
      ticker TEXT PRIMARY KEY, company_name TEXT, sector TEXT, industry TEXT, exchange TEXT,
      last_price REAL, price_updated_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS price_history (
      ticker TEXT NOT NULL, date DATE NOT NULL, open REAL, high REAL, low REAL, close REAL,
      volume INTEGER, PRIMARY KEY (ticker, date)
    );
  `);
  
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_politician ON trades(politician_id)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_golden ON trades(is_golden_trade)'); } catch(e) {}

  // Seed Ro Khanna
  if (!get('SELECT id FROM politicians WHERE last_name = ?', ['Khanna'])) {
    run(`INSERT INTO politicians (first_name, last_name, full_name, party, state, district, chamber, photo_url, twitter_handle) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Ro', 'Khanna', 'Ro Khanna', 'D', 'CA', '17', 'House',
       'https://khanna.house.gov/sites/evo-subsites/khanna.house.gov/files/evo-media-image/Khanna_Official%20Photo.jpg', 'RoKhanna']);
  }

  const committees = [
    ['Committee on Armed Services', 'Armed Services', 'House'],
    ['Subcommittee on Cyber, Information Technologies, and Innovation (CITI)', 'CITI', 'House'],
    ['Select Committee on the Chinese Communist Party (CCP)', 'CCP Select', 'House'],
    ['Committee on Oversight and Accountability', 'Oversight', 'House'],
  ];
  for (const [name, short_name, chamber] of committees) {
    if (!get('SELECT id FROM committees WHERE short_name = ?', [short_name]))
      run('INSERT INTO committees (name, short_name, chamber) VALUES (?, ?, ?)', [name, short_name, chamber]);
  }

  const roId = get('SELECT id FROM politicians WHERE last_name = ?', ['Khanna'])?.id;
  if (roId) {
    const rows = all('SELECT id, short_name FROM committees');
    const roleMap = { 'CITI': 'Ranking Member', 'CCP Select': 'Ranking Member', 'Armed Services': 'Member', 'Oversight': 'Member' };
    for (const c of rows) {
      if (!get('SELECT 1 FROM politician_committees WHERE politician_id = ? AND committee_id = ?', [roId, c.id]))
        run('INSERT INTO politician_committees (politician_id, committee_id, role) VALUES (?, ?, ?)', [roId, c.id, roleMap[c.short_name] || 'Member']);
    }
  }

  const sectorMap = {
    'CITI': ['Technology', 'Communication Services', 'Cybersecurity', 'Software', 'Cloud Computing', 'Artificial Intelligence', 'Defense IT'],
    'CCP Select': ['Semiconductors', 'Technology', 'Telecommunications', 'Export Controls', 'Supply Chain'],
    'Armed Services': ['Industrials', 'Aerospace & Defense', 'Defense', 'Military Technology'],
    'Oversight': ['Technology', 'Energy', 'Government Services']
  };
  const rows = all('SELECT id, short_name FROM committees');
  for (const c of rows) {
    for (const sector of (sectorMap[c.short_name] || [])) {
      if (!get('SELECT 1 FROM committee_sectors WHERE committee_id = ? AND sector = ?', [c.id, sector]))
        run('INSERT INTO committee_sectors (committee_id, sector) VALUES (?, ?)', [c.id, sector]);
    }
  }
  
  saveDb();
  console.log('  ✅ Datenbank erstellt');
}

// ============================================================
// STEP 2: SEED TRADES
// ============================================================

async function seedTrades() {
  console.log('\n🌱 Schritt 2: Trades einfügen...');
  
  const TRADES = [
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

  const AMOUNTS = { '$1,001 - $15,000': [1001, 15000], '$15,001 - $50,000': [15001, 50000] };
  const roId = get('SELECT id FROM politicians WHERE last_name = ?', ['Khanna'])?.id;
  
  let inserted = 0, golden = 0;
  for (const t of TRADES) {
    const amounts = AMOUNTS[t.amount_text] || [0, 0];
    // Golden Trade detection
    const sectors = all('SELECT cs.sector, c.name as committee_name, c.short_name FROM committee_sectors cs JOIN committees c ON c.id = cs.committee_id JOIN politician_committees pc ON pc.committee_id = c.id WHERE pc.politician_id = ?', [roId]);
    let isGolden = 0, goldenReason = null;
    for (const s of sectors) {
      if ((t.sector||'').toLowerCase().includes(s.sector.toLowerCase()) || s.sector.toLowerCase().includes((t.sector||'').toLowerCase()) ||
          (t.industry||'').toLowerCase().includes(s.sector.toLowerCase()) || s.sector.toLowerCase().includes((t.industry||'').toLowerCase())) {
        isGolden = 1; golden++;
        goldenReason = JSON.stringify({ sector: t.sector, industry: t.industry, committee: s.committee_name, committee_short: s.short_name, committee_sector: s.sector,
          explanation: `${t.ticker} is a ${t.industry||t.sector} company. The ${s.short_name||s.committee_name} has direct jurisdiction over ${s.sector}.` });
        break;
      }
    }
    if (!get('SELECT id FROM trades WHERE politician_id = ? AND ticker = ? AND trade_date = ? AND trade_type = ?', [roId, t.ticker, t.trade_date, t.trade_type])) {
      run('INSERT INTO trades (politician_id, ticker, company_name, trade_type, trade_date, filing_date, amount_low, amount_high, amount_text, sector, industry, is_golden_trade, golden_reason, doc_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [roId, t.ticker, t.company_name, t.trade_type, t.trade_date, t.filing_date, amounts[0], amounts[1], t.amount_text, t.sector, t.industry, isGolden, goldenReason, `seed_${t.ticker}_${t.trade_date}`]);
      inserted++;
    }
  }
  saveDb();
  console.log(`  ✅ ${inserted} Trades eingefügt (${golden} Golden Trades)`);
}

// ============================================================
// STEP 3: FETCH PRICES
// ============================================================

async function fetchPrices() {
  console.log('\n📈 Schritt 3: Aktienkurse laden (dauert ~30 Sekunden)...\n');
  
  const tickers = all('SELECT DISTINCT ticker FROM trades');
  const allTickers = [...tickers.map(t => t.ticker), 'SPY'];
  
  for (const ticker of allTickers) {
    process.stdout.write(`  ${ticker}... `);
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2y`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
      if (!response.ok) { console.log(`⚠️ HTTP ${response.status}`); await new Promise(r => setTimeout(r, 1000)); continue; }
      
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) { console.log('⚠️ no data'); continue; }
      
      const meta = result.meta;
      const timestamps = result.timestamp || [];
      const quotes = result.indicators?.quote?.[0] || {};
      const currentPrice = meta.regularMarketPrice;
      
      // Save price history
      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close?.[i];
        if (close == null) continue;
        const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        if (!get('SELECT 1 FROM price_history WHERE ticker = ? AND date = ?', [ticker, date]))
          run('INSERT INTO price_history (ticker, date, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?)',
            [ticker, date, quotes.open?.[i], quotes.high?.[i], quotes.low?.[i], close, quotes.volume?.[i]]);
      }
      
      // Update trade prices
      if (ticker !== 'SPY') {
        const trades = all('SELECT id, trade_date FROM trades WHERE ticker = ?', [ticker]);
        for (const t of trades) {
          // Try price on or before trade date
          let p = get('SELECT close FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1', [ticker, t.trade_date]);
          // Fallback: earliest available price after trade date
          if (!p) {
            p = get('SELECT close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1', [ticker, t.trade_date]);
          }
          if (p && currentPrice) {
            const pct = ((currentPrice - p.close) / p.close) * 100;
            run('UPDATE trades SET price_at_trade=?, price_current=?, percent_change=?, price_updated_at=datetime("now") WHERE id=?', [p.close, currentPrice, pct, t.id]);
          }
        }
      }
      
      console.log(`✅ $${currentPrice?.toFixed(2)}`);
      await new Promise(r => setTimeout(r, 800));
    } catch (err) { console.log(`❌ ${err.message}`); }
  }
  
  // Update S&P 500 comparison
  const allTrades = all('SELECT id, trade_date FROM trades');
  const spNow = get('SELECT close FROM price_history WHERE ticker = ? ORDER BY date DESC LIMIT 1', ['SPY']);
  for (const t of allTrades) {
    let spAt = get('SELECT close FROM price_history WHERE ticker = ? AND date <= ? ORDER BY date DESC LIMIT 1', ['SPY', t.trade_date]);
    // Fallback: earliest available SPY price after trade date
    if (!spAt) {
      spAt = get('SELECT close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC LIMIT 1', ['SPY', t.trade_date]);
    }
    if (spAt && spNow) run('UPDATE trades SET sp500_change = ? WHERE id = ?', [((spNow.close - spAt.close) / spAt.close) * 100, t.id]);
  }
  
  saveDb();
  console.log('\n  ✅ Alle Preise geladen');
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('🏛️  Congressional Trades Dashboard - Setup');
  console.log('==========================================');
  
  await setupDatabase();
  await seedTrades();
  await fetchPrices();
  
  console.log('\n==========================================');
  console.log('✅ FERTIG! Starte jetzt den Server mit:');
  console.log('   npm start');
  console.log('   Dann öffne: http://localhost:3847');
  console.log('==========================================\n');
}

main().catch(err => { console.error('❌ Fehler:', err); process.exit(1); });
