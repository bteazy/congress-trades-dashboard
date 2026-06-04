/**
 * Database Setup - Creates SQLite schema for congressional trades
 * Run once: npm run setup
 */

import { getDb, saveDb, exec, run, get, all, getDbPath } from './db.js';

async function setup() {
  await getDb();
  
  exec(`
    -- Politicians table
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Committees table
    CREATE TABLE IF NOT EXISTS committees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      chamber TEXT DEFAULT 'House'
    );

    -- Politician-Committee membership
    CREATE TABLE IF NOT EXISTS politician_committees (
      politician_id INTEGER,
      committee_id INTEGER,
      role TEXT,
      PRIMARY KEY (politician_id, committee_id)
    );

    -- Committee jurisdiction sectors (for Golden Trade detection)
    CREATE TABLE IF NOT EXISTS committee_sectors (
      committee_id INTEGER,
      sector TEXT NOT NULL,
      subsector TEXT,
      PRIMARY KEY (committee_id, sector)
    );

    -- Stock trades (the core data)
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      politician_id INTEGER,
      ticker TEXT NOT NULL,
      company_name TEXT,
      trade_type TEXT NOT NULL,
      trade_date DATE NOT NULL,
      filing_date DATE NOT NULL,
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
      doc_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Stock metadata cache
    CREATE TABLE IF NOT EXISTS stocks (
      ticker TEXT PRIMARY KEY,
      company_name TEXT,
      sector TEXT,
      industry TEXT,
      exchange TEXT,
      last_price REAL,
      price_updated_at DATETIME
    );

    -- Price history cache (for charts)
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
  `);

  // Create indexes
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_politician ON trades(politician_id)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_trades_golden ON trades(is_golden_trade)'); } catch(e) {}
  try { exec('CREATE INDEX IF NOT EXISTS idx_price_history_ticker ON price_history(ticker)'); } catch(e) {}

  console.log('✅ Database schema created at:', getDbPath());

  // Seed Ro Khanna
  const existing = get('SELECT id FROM politicians WHERE last_name = ?', ['Khanna']);
  if (!existing) {
    run(`INSERT INTO politicians (first_name, last_name, full_name, party, state, district, chamber, photo_url, twitter_handle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Ro', 'Khanna', 'Ro Khanna', 'D', 'CA', '17', 'House',
       'https://khanna.house.gov/sites/evo-subsites/khanna.house.gov/files/evo-media-image/Khanna_Official%20Photo.jpg',
       'RoKhanna']);
  }

  // Seed committees
  const committees = [
    ['Committee on Armed Services', 'Armed Services', 'House'],
    ['Subcommittee on Cyber, Information Technologies, and Innovation (CITI)', 'CITI', 'House'],
    ['Select Committee on the Chinese Communist Party (CCP)', 'CCP Select', 'House'],
    ['Committee on Oversight and Accountability', 'Oversight', 'House'],
  ];

  for (const [name, short_name, chamber] of committees) {
    const exists = get('SELECT id FROM committees WHERE short_name = ?', [short_name]);
    if (!exists) {
      run('INSERT INTO committees (name, short_name, chamber) VALUES (?, ?, ?)', [name, short_name, chamber]);
    }
  }

  // Link Ro Khanna to committees
  const roId = get('SELECT id FROM politicians WHERE last_name = ?', ['Khanna'])?.id;
  if (roId) {
    const committeeRows = all('SELECT id, short_name FROM committees');
    const roleMap = {
      'CITI': 'Ranking Member',
      'CCP Select': 'Ranking Member',
      'Armed Services': 'Member',
      'Oversight': 'Member'
    };
    
    for (const c of committeeRows) {
      const exists = get('SELECT 1 FROM politician_committees WHERE politician_id = ? AND committee_id = ?', [roId, c.id]);
      if (!exists) {
        run('INSERT INTO politician_committees (politician_id, committee_id, role) VALUES (?, ?, ?)',
          [roId, c.id, roleMap[c.short_name] || 'Member']);
      }
    }
  }

  // Seed committee sectors
  const sectorMap = {
    'CITI': ['Technology', 'Communication Services', 'Cybersecurity', 'Software', 'Cloud Computing', 'Artificial Intelligence', 'Defense IT'],
    'CCP Select': ['Semiconductors', 'Technology', 'Telecommunications', 'Export Controls', 'Supply Chain'],
    'Armed Services': ['Industrials', 'Aerospace & Defense', 'Defense', 'Military Technology'],
    'Oversight': ['Technology', 'Energy', 'Government Services']
  };

  const committeeRows = all('SELECT id, short_name FROM committees');
  for (const c of committeeRows) {
    const sectors = sectorMap[c.short_name] || [];
    for (const sector of sectors) {
      const exists = get('SELECT 1 FROM committee_sectors WHERE committee_id = ? AND sector = ?', [c.id, sector]);
      if (!exists) {
        run('INSERT INTO committee_sectors (committee_id, sector) VALUES (?, ?)', [c.id, sector]);
      }
    }
  }

  console.log('✅ Seeded Ro Khanna data with committees and sectors');
  
  saveDb();
  console.log('✅ Database saved to disk');
}

setup().catch(err => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
