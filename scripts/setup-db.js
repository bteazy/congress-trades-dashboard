/**
 * Database Setup Script
 * Creates all tables, indexes, and seeds initial committee data
 */

import { getDb, saveDb, exec, run, get, all } from '../src/db.js';

async function setup() {
  console.log('📊 Setting up database...\n');
  await getDb();

  // ============================================================
  // SCHEMA
  // ============================================================
  exec(`
    -- Politicians
    CREATE TABLE IF NOT EXISTS politicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      party TEXT,
      state TEXT,
      district TEXT,
      chamber TEXT DEFAULT 'House',
      photo_url TEXT,
      twitter_handle TEXT,
      bioguide_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Committees
    CREATE TABLE IF NOT EXISTS committees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      chamber TEXT DEFAULT 'House'
    );

    -- Politician <-> Committee mapping
    CREATE TABLE IF NOT EXISTS politician_committees (
      politician_id INTEGER,
      committee_id INTEGER,
      role TEXT DEFAULT 'Member',
      PRIMARY KEY (politician_id, committee_id)
    );

    -- Committee <-> Sector mapping (for Golden Trade detection)
    CREATE TABLE IF NOT EXISTS committee_sectors (
      committee_id INTEGER,
      sector TEXT NOT NULL,
      PRIMARY KEY (committee_id, sector)
    );

    -- Trades (core table)
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      politician_id INTEGER,
      ticker TEXT,
      asset_name TEXT,
      asset_type TEXT DEFAULT 'Stock',
      trade_type TEXT NOT NULL,
      trade_date DATE NOT NULL,
      filing_date DATE,
      disclosure_date DATE,
      amount_low REAL,
      amount_high REAL,
      amount_text TEXT,
      sector TEXT,
      industry TEXT,
      is_golden_trade INTEGER DEFAULT 0,
      golden_reason TEXT,
      price_at_trade REAL,
      price_current REAL,
      price_updated_at DATETIME,
      percent_change REAL,
      sp500_change REAL,
      filing_url TEXT,
      doc_id TEXT UNIQUE,
      source TEXT DEFAULT 'house_clerk',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Stock price history
    CREATE TABLE IF NOT EXISTS price_history (
      ticker TEXT NOT NULL,
      date DATE NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER,
      PRIMARY KEY (ticker, date)
    );

    -- Stocks metadata
    CREATE TABLE IF NOT EXISTS stocks (
      ticker TEXT PRIMARY KEY,
      company_name TEXT,
      sector TEXT,
      industry TEXT,
      exchange TEXT,
      last_price REAL,
      price_updated_at DATETIME
    );

    -- Email alerts subscriptions
    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      alert_type TEXT DEFAULT 'all',
      politician_id INTEGER,
      ticker TEXT,
      min_amount REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- User preferences
    CREATE TABLE IF NOT EXISTS user_preferences (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_trades_politician ON trades(politician_id)',
    'CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker)',
    'CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date)',
    'CREATE INDEX IF NOT EXISTS idx_trades_golden ON trades(is_golden_trade)',
    'CREATE INDEX IF NOT EXISTS idx_trades_asset_type ON trades(asset_type)',
    'CREATE INDEX IF NOT EXISTS idx_trades_filing_date ON trades(filing_date)',
    'CREATE INDEX IF NOT EXISTS idx_price_history_ticker ON price_history(ticker)',
    'CREATE INDEX IF NOT EXISTS idx_politicians_chamber ON politicians(chamber)',
    'CREATE INDEX IF NOT EXISTS idx_politicians_bioguide ON politicians(bioguide_id)',
  ];
  for (const idx of indexes) {
    try { exec(idx); } catch(e) {}
  }

  console.log('  ✅ Tables and indexes created');

  // ============================================================
  // SEED COMMITTEES (major ones relevant for Golden Trade detection)
  // ============================================================
  const committees = [
    // House
    ['Committee on Financial Services', 'Financial Services', 'House'],
    ['Committee on Energy and Commerce', 'Energy & Commerce', 'House'],
    ['Committee on Armed Services', 'Armed Services', 'House'],
    ['Committee on Science, Space, and Technology', 'Science & Tech', 'House'],
    ['Committee on Agriculture', 'Agriculture', 'House'],
    ['Committee on Transportation and Infrastructure', 'Transportation', 'House'],
    ['Committee on Natural Resources', 'Natural Resources', 'House'],
    ['Subcommittee on Cyber, Information Technologies, and Innovation', 'CITI', 'House'],
    ['Select Committee on the Chinese Communist Party', 'CCP Select', 'House'],
    ['Committee on Oversight and Accountability', 'Oversight', 'House'],
    // Senate
    ['Committee on Banking, Housing, and Urban Affairs', 'Banking', 'Senate'],
    ['Committee on Commerce, Science, and Transportation', 'Commerce', 'Senate'],
    ['Committee on Energy and Natural Resources', 'Energy', 'Senate'],
    ['Committee on Finance', 'Finance', 'Senate'],
    ['Committee on Health, Education, Labor, and Pensions', 'HELP', 'Senate'],
    ['Committee on Armed Services', 'Armed Services (Senate)', 'Senate'],
    ['Committee on Agriculture, Nutrition, and Forestry', 'Agriculture (Senate)', 'Senate'],
  ];

  for (const [name, short_name, chamber] of committees) {
    if (!get('SELECT id FROM committees WHERE name = ? AND chamber = ?', [name, chamber])) {
      run('INSERT INTO committees (name, short_name, chamber) VALUES (?, ?, ?)', [name, short_name, chamber]);
    }
  }

  // Committee -> Sector mappings
  const sectorMap = {
    'Financial Services': ['Financial Services', 'Banking', 'Insurance', 'Real Estate', 'Fintech'],
    'Energy & Commerce': ['Energy', 'Healthcare', 'Pharmaceuticals', 'Telecommunications', 'Consumer Goods'],
    'Armed Services': ['Aerospace & Defense', 'Military Technology', 'Cybersecurity', 'Industrials'],
    'Science & Tech': ['Technology', 'Software', 'Semiconductors', 'Artificial Intelligence', 'Cloud Computing'],
    'Agriculture': ['Agriculture', 'Food & Beverage', 'Commodities'],
    'Transportation': ['Transportation', 'Airlines', 'Logistics', 'Infrastructure'],
    'Natural Resources': ['Energy', 'Mining', 'Oil & Gas', 'Utilities'],
    'CITI': ['Technology', 'Communication Services', 'Cybersecurity', 'Software', 'Cloud Computing', 'Artificial Intelligence'],
    'CCP Select': ['Semiconductors', 'Technology', 'Telecommunications', 'Supply Chain'],
    'Oversight': ['Technology', 'Energy', 'Government Services'],
    'Banking': ['Financial Services', 'Banking', 'Real Estate', 'Insurance', 'Cryptocurrency'],
    'Commerce': ['Technology', 'Telecommunications', 'Transportation', 'Consumer Goods'],
    'Energy': ['Energy', 'Oil & Gas', 'Utilities', 'Renewable Energy', 'Mining'],
    'Finance': ['Financial Services', 'Healthcare', 'Tax', 'Trade'],
    'HELP': ['Healthcare', 'Pharmaceuticals', 'Biotechnology', 'Education'],
    'Armed Services (Senate)': ['Aerospace & Defense', 'Military Technology', 'Cybersecurity'],
    'Agriculture (Senate)': ['Agriculture', 'Food & Beverage', 'Commodities', 'Rural Development'],
  };

  const committeeRows = all('SELECT id, short_name FROM committees');
  for (const c of committeeRows) {
    const sectors = sectorMap[c.short_name] || [];
    for (const sector of sectors) {
      if (!get('SELECT 1 FROM committee_sectors WHERE committee_id = ? AND sector = ?', [c.id, sector])) {
        run('INSERT INTO committee_sectors (committee_id, sector) VALUES (?, ?)', [c.id, sector]);
      }
    }
  }

  console.log('  ✅ Committees and sector mappings seeded');

  saveDb();
  console.log('\n✅ Database setup complete!');
}

setup().catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
