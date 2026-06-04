/**
 * Express API Server for Congressional Trades Dashboard
 * Run: npm start
 */

import express from 'express';
import { getDb, saveDb, all, get, run, getDbPath } from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3847;

// Serve static files
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// ============================================================
// API ROUTES
// ============================================================

// GET /api/politicians - List all politicians
app.get('/api/politicians', (req, res) => {
  const politicians = all(`
    SELECT p.*,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id) as trade_count,
      (SELECT SUM(amount_high) FROM trades WHERE politician_id = p.id) as total_volume,
      (SELECT MAX(trade_date) FROM trades WHERE politician_id = p.id) as last_trade_date
    FROM politicians p
    ORDER BY p.last_name
  `);
  res.json(politicians);
});

// GET /api/politicians/:id - Single politician with full details
app.get('/api/politicians/:id', (req, res) => {
  const politician = get(`
    SELECT p.*,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id) as trade_count,
      (SELECT SUM(amount_high) FROM trades WHERE politician_id = p.id) as total_volume,
      (SELECT MAX(trade_date) FROM trades WHERE politician_id = p.id) as last_trade_date,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id AND is_golden_trade = 1) as golden_count
    FROM politicians p
    WHERE p.id = ?
  `, [Number(req.params.id)]);
  
  if (!politician) return res.status(404).json({ error: 'Not found' });
  
  const committees = all(`
    SELECT c.*, pc.role,
      (SELECT GROUP_CONCAT(cs.sector, ', ') FROM committee_sectors cs WHERE cs.committee_id = c.id) as sectors
    FROM committees c
    JOIN politician_committees pc ON pc.committee_id = c.id
    WHERE pc.politician_id = ?
  `, [Number(req.params.id)]);
  
  res.json({ ...politician, committees });
});

// GET /api/trades - All trades with filtering
app.get('/api/trades', (req, res) => {
  const { politician_id, ticker, golden_only, trade_type, limit = 50, offset = 0 } = req.query;
  
  let where = ['1=1'];
  let params = [];
  
  if (politician_id) { where.push('t.politician_id = ?'); params.push(Number(politician_id)); }
  if (ticker) { where.push('t.ticker = ?'); params.push(ticker.toUpperCase()); }
  if (golden_only === '1') { where.push('t.is_golden_trade = 1'); }
  if (trade_type) { where.push('t.trade_type = ?'); params.push(trade_type); }
  
  const countParams = [...params];
  params.push(Number(limit), Number(offset));
  
  const trades = all(`
    SELECT t.*, p.full_name, p.party, p.state, p.photo_url
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.trade_date DESC
    LIMIT ? OFFSET ?
  `, params);
  
  const total = get(`SELECT COUNT(*) as count FROM trades t WHERE ${where.join(' AND ')}`, countParams);
  
  res.json({ trades, total: total?.count || 0 });
});

// GET /api/trades/:id - Single trade detail
app.get('/api/trades/:id', (req, res) => {
  const trade = get(`
    SELECT t.*, p.full_name, p.party, p.state, p.district, p.photo_url, p.twitter_handle
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE t.id = ?
  `, [Number(req.params.id)]);
  
  if (!trade) return res.status(404).json({ error: 'Not found' });
  
  const committees = all(`
    SELECT c.*, pc.role,
      (SELECT GROUP_CONCAT(cs.sector, ', ') FROM committee_sectors cs WHERE cs.committee_id = c.id) as sectors
    FROM committees c
    JOIN politician_committees pc ON pc.committee_id = c.id
    WHERE pc.politician_id = ?
  `, [trade.politician_id]);
  
  res.json({ ...trade, committees });
});

// GET /api/chart/:ticker - Price history for charting
app.get('/api/chart/:ticker', (req, res) => {
  const { range = '1m' } = req.query;
  const ticker = req.params.ticker.toUpperCase();
  
  const now = new Date();
  let startDate;
  switch (range) {
    case '5d': startDate = new Date(now - 5 * 24 * 60 * 60 * 1000); break;
    case '1m': startDate = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
    case '6m': startDate = new Date(now - 180 * 24 * 60 * 60 * 1000); break;
    case 'ytd': startDate = new Date(now.getFullYear(), 0, 1); break;
    case '1y': startDate = new Date(now - 365 * 24 * 60 * 60 * 1000); break;
    case '5y': startDate = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000); break;
    default: startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
  
  const startStr = startDate.toISOString().split('T')[0];
  
  const history = all(`
    SELECT date, close, open, high, low, volume
    FROM price_history
    WHERE ticker = ? AND date >= ?
    ORDER BY date ASC
  `, [ticker, startStr]);
  
  const sp500 = all(`
    SELECT date, close
    FROM price_history
    WHERE ticker = 'SPY' AND date >= ?
    ORDER BY date ASC
  `, [startStr]);
  
  res.json({ ticker, history, sp500 });
});

// GET /api/stats/:politician_id - Profitability statistics
app.get('/api/stats/:politician_id', (req, res) => {
  const id = Number(req.params.politician_id);
  
  const overall = get(`
    SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN trade_type LIKE '%Purchase%' THEN 1 ELSE 0 END) as purchases,
      SUM(CASE WHEN trade_type LIKE '%Sale%' THEN 1 ELSE 0 END) as sales,
      AVG(percent_change) as avg_return,
      SUM(CASE WHEN percent_change > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN is_golden_trade = 1 THEN 1 ELSE 0 END) as golden_trades,
      AVG(CASE WHEN is_golden_trade = 1 THEN percent_change END) as avg_golden_return,
      AVG(CASE WHEN is_golden_trade = 0 THEN percent_change END) as avg_non_golden_return
    FROM trades WHERE politician_id = ? AND percent_change IS NOT NULL
  `, [id]);
  
  const sectors = all(`
    SELECT sector, 
      COUNT(*) as count, 
      AVG(percent_change) as avg_return,
      SUM(amount_high) as volume
    FROM trades 
    WHERE politician_id = ? AND sector != ''
    GROUP BY sector
    ORDER BY count DESC
  `, [id]);
  
  const monthly = all(`
    SELECT strftime('%Y-%m', trade_date) as month,
      COUNT(*) as trades,
      AVG(percent_change) as avg_return
    FROM trades
    WHERE politician_id = ?
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `, [id]);
  
  res.json({ overall, sectors, monthly });
});

// POST /api/fetch-live-price/:ticker - Fetch live price from Yahoo
app.post('/api/fetch-live-price/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    if (!response.ok) return res.status(502).json({ error: 'Yahoo Finance unavailable' });
    
    const data = await response.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    
    if (price) {
      run('INSERT OR REPLACE INTO stocks (ticker, last_price, price_updated_at) VALUES (?, ?, datetime("now"))', [ticker, price]);
      run('UPDATE trades SET price_current = ?, price_updated_at = datetime("now"), percent_change = CASE WHEN price_at_trade > 0 THEN ((? - price_at_trade) / price_at_trade) * 100 ELSE NULL END WHERE ticker = ?',
        [price, price, ticker]);
      saveDb();
    }
    
    res.json({ ticker, price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// START SERVER
// ============================================================

async function start() {
  await getDb();
  
  app.listen(PORT, () => {
    console.log(`\n🏛️  Congressional Trades Dashboard`);
    console.log(`   Running at: http://localhost:${PORT}`);
    console.log(`   Database: ${getDbPath()}\n`);
  });
}

start().catch(err => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});
