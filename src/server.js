/**
 * Congress Trades Dashboard - API Server v2.0
 * 
 * Features:
 * - All trades (stocks, options, bonds) - excludes ETFs/crypto
 * - Hot Stocks detection (multiple politicians buying same stock)
 * - Politician Scorecards (win rate, avg return, best sector)
 * - Sector Heatmap
 * - Timeline view
 * - Copy-Trading Simulator
 * - Politician comparison
 * - Email alerts
 * - CSV/PDF export
 * - eToro deep links
 */

import express from 'express';
import { getDb, saveDb, all, get, run, getDbPath } from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3847;

app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// ============================================================
// UTILITY
// ============================================================

function etoroLink(ticker) {
  if (!ticker) return null;
  return `https://www.etoro.com/markets/${ticker.toLowerCase()}`;
}

// ============================================================
// API: POLITICIANS
// ============================================================

app.get('/api/politicians', (req, res) => {
  const { chamber, party, search, sort = 'trades', limit = 100 } = req.query;
  let where = ['1=1'];
  let params = [];

  if (chamber) { where.push('p.chamber = ?'); params.push(chamber); }
  if (party) { where.push('p.party = ?'); params.push(party); }
  if (search) { where.push('p.full_name LIKE ?'); params.push(`%${search}%`); }

  let orderBy = 'trade_count DESC';
  if (sort === 'return') orderBy = 'avg_return DESC';
  if (sort === 'name') orderBy = 'p.last_name ASC';
  if (sort === 'recent') orderBy = 'last_trade_date DESC';

  const politicians = all(`
    SELECT p.*,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id) as trade_count,
      (SELECT AVG(percent_change) FROM trades WHERE politician_id = p.id AND percent_change IS NOT NULL) as avg_return,
      (SELECT MAX(trade_date) FROM trades WHERE politician_id = p.id) as last_trade_date,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id AND is_golden_trade = 1) as golden_count
    FROM politicians p
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ?
  `, [...params, Number(limit)]);

  res.json(politicians);
});

app.get('/api/politicians/:id', (req, res) => {
  const id = Number(req.params.id);
  const politician = get(`
    SELECT p.*,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id) as trade_count,
      (SELECT AVG(percent_change) FROM trades WHERE politician_id = p.id AND percent_change IS NOT NULL) as avg_return,
      (SELECT MAX(trade_date) FROM trades WHERE politician_id = p.id) as last_trade_date,
      (SELECT COUNT(*) FROM trades WHERE politician_id = p.id AND is_golden_trade = 1) as golden_count
    FROM politicians p WHERE p.id = ?
  `, [id]);

  if (!politician) return res.status(404).json({ error: 'Not found' });

  const committees = all(`
    SELECT c.*, pc.role
    FROM committees c
    JOIN politician_committees pc ON pc.committee_id = c.id
    WHERE pc.politician_id = ?
  `, [id]);

  res.json({ ...politician, committees });
});

// ============================================================
// API: TRADES
// ============================================================

app.get('/api/trades', (req, res) => {
  const { politician_id, ticker, golden_only, trade_type, asset_type, 
          days = 365, limit = 50, offset = 0, sort = 'date' } = req.query;

  let where = ['1=1'];
  let params = [];

  if (politician_id) { where.push('t.politician_id = ?'); params.push(Number(politician_id)); }
  if (ticker) { where.push('t.ticker = ?'); params.push(ticker.toUpperCase()); }
  if (golden_only === '1') { where.push('t.is_golden_trade = 1'); }
  if (trade_type) { where.push('t.trade_type LIKE ?'); params.push(`%${trade_type}%`); }
  if (asset_type) { where.push('t.asset_type = ?'); params.push(asset_type); }
  if (days) { where.push("t.trade_date >= date('now', '-' || ? || ' days')"); params.push(Number(days)); }

  let orderBy = 't.trade_date DESC';
  if (sort === 'return') orderBy = 't.percent_change DESC';
  if (sort === 'amount') orderBy = 't.amount_high DESC';

  const countParams = [...params];
  params.push(Number(limit), Number(offset));

  const trades = all(`
    SELECT t.*, p.full_name, p.party, p.state, p.chamber, p.photo_url
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `, params);

  // Add eToro links
  trades.forEach(t => { t.etoro_link = etoroLink(t.ticker); });

  const total = get(`SELECT COUNT(*) as count FROM trades t WHERE ${where.join(' AND ')}`, countParams);
  res.json({ trades, total: total?.count || 0 });
});

// ============================================================
// API: HOT STOCKS 🔥
// ============================================================

app.get('/api/hot', (req, res) => {
  const { days = 60, min_buyers = 2 } = req.query;

  // Find stocks bought by multiple politicians within the time window
  const hotStocks = all(`
    SELECT 
      t.ticker,
      MAX(t.asset_name) as company_name,
      COUNT(DISTINCT t.politician_id) as buyer_count,
      COUNT(*) as trade_count,
      SUM(CASE WHEN t.is_golden_trade = 1 THEN 1 ELSE 0 END) as golden_count,
      MAX(t.trade_date) as latest_trade,
      MIN(t.trade_date) as earliest_trade,
      AVG(t.percent_change) as avg_return,
      MAX(t.price_current) as current_price,
      MAX(t.sector) as sector
    FROM trades t
    WHERE t.ticker IS NOT NULL 
    AND t.ticker != ''
    AND t.trade_type LIKE '%Purchase%'
    AND t.trade_date >= date('now', '-' || ? || ' days')
    AND t.asset_type = 'Stock'
    GROUP BY t.ticker
    HAVING COUNT(DISTINCT t.politician_id) >= ?
    ORDER BY buyer_count DESC, trade_count DESC
  `, [Number(days), Number(min_buyers)]);

  // Add eToro links
  hotStocks.forEach(s => { s.etoro_link = etoroLink(s.ticker); });

  res.json(hotStocks);
});

// Hot stock detail: who bought it
app.get('/api/hot/:ticker', (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const { days = 90 } = req.query;

  const trades = all(`
    SELECT t.*, p.full_name, p.party, p.state, p.chamber, p.photo_url,
      (SELECT AVG(t2.percent_change) FROM trades t2 
       WHERE t2.politician_id = t.politician_id 
       AND t2.trade_date >= date('now', '-90 days')
       AND t2.percent_change IS NOT NULL) as politician_3mo_return
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE t.ticker = ?
    AND t.trade_type LIKE '%Purchase%'
    AND t.trade_date >= date('now', '-' || ? || ' days')
    ORDER BY t.is_golden_trade DESC, t.trade_date DESC
  `, [ticker, Number(days)]);

  trades.forEach(t => { t.etoro_link = etoroLink(t.ticker); });

  const stockInfo = get('SELECT * FROM stocks WHERE ticker = ?', [ticker]);

  res.json({ ticker, stock: stockInfo, trades, etoro_link: etoroLink(ticker) });
});

// ============================================================
// API: POLITICIAN SCORECARDS
// ============================================================

app.get('/api/scorecard/:id', (req, res) => {
  const id = Number(req.params.id);

  const politician = get('SELECT * FROM politicians WHERE id = ?', [id]);
  if (!politician) return res.status(404).json({ error: 'Not found' });

  // Overall stats
  const stats = get(`
    SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN trade_type LIKE '%Purchase%' THEN 1 ELSE 0 END) as purchases,
      SUM(CASE WHEN trade_type LIKE '%Sale%' THEN 1 ELSE 0 END) as sales,
      AVG(percent_change) as avg_return,
      SUM(CASE WHEN percent_change > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN percent_change <= 0 THEN 1 ELSE 0 END) as losing_trades,
      MAX(percent_change) as best_trade_return,
      MIN(percent_change) as worst_trade_return,
      SUM(CASE WHEN is_golden_trade = 1 THEN 1 ELSE 0 END) as golden_trades,
      AVG(CASE WHEN is_golden_trade = 1 THEN percent_change END) as avg_golden_return
    FROM trades WHERE politician_id = ? AND percent_change IS NOT NULL
  `, [id]);

  // Win rate
  const winRate = stats?.winning_trades && stats?.total_trades 
    ? (stats.winning_trades / stats.total_trades * 100) : 0;

  // Best sector
  const bestSector = get(`
    SELECT sector, AVG(percent_change) as avg_return, COUNT(*) as count
    FROM trades 
    WHERE politician_id = ? AND sector != '' AND percent_change IS NOT NULL
    GROUP BY sector
    ORDER BY avg_return DESC
    LIMIT 1
  `, [id]);

  // Sector breakdown
  const sectors = all(`
    SELECT sector, COUNT(*) as count, AVG(percent_change) as avg_return, SUM(amount_high) as volume
    FROM trades WHERE politician_id = ? AND sector != ''
    GROUP BY sector ORDER BY count DESC
  `, [id]);

  // Monthly performance
  const monthly = all(`
    SELECT strftime('%Y-%m', trade_date) as month,
      COUNT(*) as trades, AVG(percent_change) as avg_return
    FROM trades WHERE politician_id = ?
    GROUP BY month ORDER BY month DESC LIMIT 12
  `, [id]);

  // Recent trades
  const recentTrades = all(`
    SELECT t.*, p.full_name FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE t.politician_id = ? ORDER BY t.trade_date DESC LIMIT 10
  `, [id]);
  recentTrades.forEach(t => { t.etoro_link = etoroLink(t.ticker); });

  res.json({
    politician,
    stats: { ...stats, win_rate: winRate },
    best_sector: bestSector,
    sectors,
    monthly,
    recent_trades: recentTrades
  });
});

// ============================================================
// API: SECTOR HEATMAP
// ============================================================

app.get('/api/heatmap', (req, res) => {
  const { days = 30 } = req.query;

  const sectors = all(`
    SELECT 
      sector,
      COUNT(*) as trade_count,
      SUM(CASE WHEN trade_type LIKE '%Purchase%' THEN 1 ELSE 0 END) as buys,
      SUM(CASE WHEN trade_type LIKE '%Sale%' THEN 1 ELSE 0 END) as sells,
      COUNT(DISTINCT politician_id) as unique_traders,
      AVG(percent_change) as avg_return,
      SUM(amount_high) as total_volume
    FROM trades
    WHERE sector != '' AND sector IS NOT NULL
    AND trade_date >= date('now', '-' || ? || ' days')
    GROUP BY sector
    ORDER BY trade_count DESC
  `, [Number(days)]);

  res.json(sectors);
});

// ============================================================
// API: TIMELINE
// ============================================================

app.get('/api/timeline', (req, res) => {
  const { days = 30, limit = 100 } = req.query;

  const trades = all(`
    SELECT t.*, p.full_name, p.party, p.state, p.chamber, p.photo_url
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE t.trade_date >= date('now', '-' || ? || ' days')
    ORDER BY t.trade_date DESC
    LIMIT ?
  `, [Number(days), Number(limit)]);

  trades.forEach(t => { t.etoro_link = etoroLink(t.ticker); });
  res.json(trades);
});

// ============================================================
// API: COPY-TRADING SIMULATOR
// ============================================================

app.get('/api/simulate', (req, res) => {
  const { politician_id, start_capital = 10000, days = 365 } = req.query;
  
  let where = "t.trade_type LIKE '%Purchase%' AND t.percent_change IS NOT NULL";
  let params = [Number(days)];
  
  if (politician_id) {
    where += ' AND t.politician_id = ?';
    params.push(Number(politician_id));
  }

  const trades = all(`
    SELECT t.*, p.full_name
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE ${where}
    AND t.trade_date >= date('now', '-' || ? || ' days')
    ORDER BY t.trade_date ASC
  `, params);

  if (trades.length === 0) {
    return res.json({ 
      start_capital: Number(start_capital), 
      final_value: Number(start_capital), 
      total_return: 0, 
      trades: [], 
      timeline: [] 
    });
  }

  // Simulate: equal weight each trade, compound returns
  let capital = Number(start_capital);
  const positionSize = capital / Math.max(trades.length, 1);
  let totalReturn = 0;
  const timeline = [];
  const tradeResults = [];

  for (const trade of trades) {
    const returnPct = trade.percent_change / 100;
    const profit = positionSize * returnPct;
    capital += profit;
    totalReturn += trade.percent_change;

    tradeResults.push({
      ticker: trade.ticker,
      politician: trade.full_name,
      trade_date: trade.trade_date,
      return_pct: trade.percent_change,
      profit: profit.toFixed(2),
      etoro_link: etoroLink(trade.ticker)
    });

    timeline.push({
      date: trade.trade_date,
      portfolio_value: capital.toFixed(2),
      trade: trade.ticker
    });
  }

  // S&P 500 comparison
  const spFirst = get(`SELECT close FROM price_history WHERE ticker = 'SPY' AND date >= date('now', '-' || ? || ' days') ORDER BY date ASC LIMIT 1`, [Number(days)]);
  const spLast = get(`SELECT close FROM price_history WHERE ticker = 'SPY' ORDER BY date DESC LIMIT 1`);
  const sp500Return = (spFirst && spLast) ? ((spLast.close - spFirst.close) / spFirst.close * 100) : 0;

  res.json({
    start_capital: Number(start_capital),
    final_value: parseFloat(capital.toFixed(2)),
    total_return: parseFloat((((capital - Number(start_capital)) / Number(start_capital)) * 100).toFixed(2)),
    avg_trade_return: parseFloat((totalReturn / trades.length).toFixed(2)),
    sp500_return: parseFloat(sp500Return.toFixed(2)),
    num_trades: trades.length,
    trades: tradeResults,
    timeline
  });
});

// ============================================================
// API: POLITICIAN COMPARISON
// ============================================================

app.get('/api/compare', (req, res) => {
  const { ids } = req.query; // comma-separated IDs
  if (!ids) return res.status(400).json({ error: 'Provide ids parameter (comma-separated)' });

  const idList = ids.split(',').map(Number).filter(n => !isNaN(n));
  
  const results = idList.map(id => {
    const politician = get('SELECT * FROM politicians WHERE id = ?', [id]);
    if (!politician) return null;

    const stats = get(`
      SELECT 
        COUNT(*) as total_trades,
        AVG(percent_change) as avg_return,
        SUM(CASE WHEN percent_change > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN percent_change <= 0 THEN 1 ELSE 0 END) as losses,
        MAX(percent_change) as best_return,
        MIN(percent_change) as worst_return,
        SUM(CASE WHEN is_golden_trade = 1 THEN 1 ELSE 0 END) as golden_trades
      FROM trades WHERE politician_id = ? AND percent_change IS NOT NULL
    `, [id]);

    const winRate = stats?.wins && stats?.total_trades 
      ? (stats.wins / stats.total_trades * 100) : 0;

    const topSectors = all(`
      SELECT sector, AVG(percent_change) as avg_return, COUNT(*) as count
      FROM trades WHERE politician_id = ? AND sector != '' AND percent_change IS NOT NULL
      GROUP BY sector ORDER BY avg_return DESC LIMIT 3
    `, [id]);

    return { politician, stats: { ...stats, win_rate: winRate }, top_sectors: topSectors };
  }).filter(Boolean);

  res.json(results);
});

// ============================================================
// API: CHART DATA
// ============================================================

app.get('/api/chart/:ticker', (req, res) => {
  const { range = '1y' } = req.query;
  const ticker = req.params.ticker.toUpperCase();

  const now = new Date();
  let startDate;
  switch (range) {
    case '5d': startDate = new Date(now - 5 * 86400000); break;
    case '1m': startDate = new Date(now - 30 * 86400000); break;
    case '3m': startDate = new Date(now - 90 * 86400000); break;
    case '6m': startDate = new Date(now - 180 * 86400000); break;
    case 'ytd': startDate = new Date(now.getFullYear(), 0, 1); break;
    case '1y': startDate = new Date(now - 365 * 86400000); break;
    default: startDate = new Date(now - 365 * 86400000);
  }

  const startStr = startDate.toISOString().split('T')[0];

  const history = all(
    'SELECT date, close, open, high, low, volume FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC',
    [ticker, startStr]
  );
  const sp500 = all(
    'SELECT date, close FROM price_history WHERE ticker = ? AND date >= ? ORDER BY date ASC',
    ['SPY', startStr]
  );

  res.json({ ticker, history, sp500, etoro_link: etoroLink(ticker) });
});

// ============================================================
// API: ALERTS
// ============================================================

app.post('/api/alerts/subscribe', (req, res) => {
  const { email, alert_type = 'all', politician_id, ticker, min_amount = 0 } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  run(`INSERT INTO alert_subscriptions (email, alert_type, politician_id, ticker, min_amount)
       VALUES (?, ?, ?, ?, ?)`,
    [email, alert_type, politician_id || null, ticker || null, min_amount]);
  
  saveDb();
  res.json({ success: true, message: 'Subscribed to alerts!' });
});

app.delete('/api/alerts/:id', (req, res) => {
  run('DELETE FROM alert_subscriptions WHERE id = ?', [Number(req.params.id)]);
  saveDb();
  res.json({ success: true });
});

app.get('/api/alerts', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const subs = all('SELECT * FROM alert_subscriptions WHERE email = ? AND active = 1', [email]);
  res.json(subs);
});

// ============================================================
// API: EXPORT (CSV)
// ============================================================

app.get('/api/export/trades', (req, res) => {
  const { politician_id, days = 365, format = 'csv' } = req.query;

  let where = "t.trade_date >= date('now', '-' || ? || ' days')";
  let params = [Number(days)];
  
  if (politician_id) {
    where += ' AND t.politician_id = ?';
    params.push(Number(politician_id));
  }

  const trades = all(`
    SELECT t.ticker, t.asset_name, t.asset_type, t.trade_type, t.trade_date,
           t.filing_date, t.amount_text, t.sector, t.industry, t.is_golden_trade,
           t.price_at_trade, t.price_current, t.percent_change, t.sp500_change,
           p.full_name as politician, p.party, p.state, p.chamber
    FROM trades t
    JOIN politicians p ON p.id = t.politician_id
    WHERE ${where}
    ORDER BY t.trade_date DESC
  `, params);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="congress_trades.json"');
    return res.json(trades);
  }

  // CSV format
  const headers = Object.keys(trades[0] || {});
  const csv = [
    headers.join(','),
    ...trades.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(','))
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="congress_trades.csv"');
  res.send(csv);
});

// ============================================================
// API: SEARCH
// ============================================================

app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ politicians: [], tickers: [] });

  const politicians = all(
    'SELECT id, full_name, party, state, chamber FROM politicians WHERE full_name LIKE ? LIMIT 10',
    [`%${q}%`]
  );

  const tickers = all(`
    SELECT DISTINCT ticker, MAX(asset_name) as name, COUNT(*) as trade_count
    FROM trades WHERE ticker LIKE ? AND ticker IS NOT NULL
    GROUP BY ticker ORDER BY trade_count DESC LIMIT 10
  `, [`%${q.toUpperCase()}%`]);
  
  tickers.forEach(t => { t.etoro_link = etoroLink(t.ticker); });

  res.json({ politicians, tickers });
});

// ============================================================
// API: DASHBOARD STATS
// ============================================================

app.get('/api/stats', (req, res) => {
  const totalTrades = get('SELECT COUNT(*) as c FROM trades')?.c || 0;
  const totalPoliticians = get('SELECT COUNT(*) as c FROM politicians')?.c || 0;
  const goldenTrades = get('SELECT COUNT(*) as c FROM trades WHERE is_golden_trade = 1')?.c || 0;
  const recentTrades = get("SELECT COUNT(*) as c FROM trades WHERE trade_date >= date('now', '-30 days')")?.c || 0;
  const avgReturn = get('SELECT AVG(percent_change) as avg FROM trades WHERE percent_change IS NOT NULL')?.avg || 0;
  const lastUpdate = get('SELECT MAX(price_updated_at) as last FROM trades')?.last || 'Never';

  res.json({
    total_trades: totalTrades,
    total_politicians: totalPoliticians,
    golden_trades: goldenTrades,
    recent_trades_30d: recentTrades,
    avg_return: parseFloat(avgReturn.toFixed(2)),
    last_price_update: lastUpdate
  });
});

// ============================================================
// API: USER PREFERENCES (theme etc.)
// ============================================================

app.get('/api/preferences', (req, res) => {
  const prefs = all('SELECT key, value FROM user_preferences');
  const obj = {};
  prefs.forEach(p => { obj[p.key] = p.value; });
  res.json(obj);
});

app.post('/api/preferences', (req, res) => {
  const { key, value } = req.body;
  run('INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)', [key, value]);
  saveDb();
  res.json({ success: true });
});

// ============================================================
// START SERVER
// ============================================================

async function start() {
  await getDb();
  app.listen(PORT, () => {
    console.log(`\n🏛️  Congressional Trades Dashboard v2.0`);
    console.log(`   Running at: http://localhost:${PORT}`);
    console.log(`   Database: ${getDbPath()}\n`);
  });
}

start().catch(err => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});
