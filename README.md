# 🏛️ CongressTrades Dashboard v2.0

Track stock trades by US Congress members. Detect Golden Trades, find Hot Stocks, compare politicians, and simulate copy-trading — all from official STOCK Act disclosures.

## ✨ Features

### 🔥 Hot Stocks
Stocks being bought by multiple politicians within a short timeframe. Click into any hot stock to see which politicians bought it, their 3-month returns, and Golden Trade status.

### 📊 All Trades
Browse 5000+ trades with filters for asset type (Stocks, Options, Bonds), trade type (Buy/Sell), and Golden Trade status. Includes eToro deep links for every ticker.

### 👥 Politician Scorecards
Detailed performance cards: Win Rate, Avg Return, Best/Worst Trade, Golden Trade count, sector breakdown, and recent trades.

### 📅 Timeline
Chronological view of all trades with visual indicators for buys (green), sells (red), and golden trades (gold).

### 🗺️ Sector Heatmap
See which sectors politicians are trading most — buy/sell ratio, unique traders, and volume.

### 💰 Copy-Trading Simulator
"What if you copied every trade?" Simulates portfolio performance vs S&P 500 with configurable start capital and time period.

### ⚖️ Politician Comparison
Compare two politicians head-to-head on win rate, returns, sectors, and trade volume.

### 🔔 Email Alerts
Subscribe to get notified when top traders make moves (all trades, golden only, or hot stocks only).

### 📥 Export
Download all trade data as CSV or JSON for your own analysis.

### 🌙/☀️ Dark/Light Mode
Toggle between dark and light themes.

### 🔗 eToro Deep Links
Every ticker links directly to eToro for one-click trading.

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/bteazy/congress-trades-dashboard.git
cd congress-trades-dashboard

# Install dependencies
npm install

# Full setup: create DB + fetch trades + fetch prices
npm run full-setup

# Start the dashboard
npm start
# → http://localhost:3847
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the dashboard server |
| `npm run dev` | Start with auto-reload (development) |
| `npm run setup` | Create database and seed committees |
| `npm run fetch-trades` | Fetch all trades from official sources |
| `npm run fetch-prices` | Update stock prices from Yahoo Finance |
| `npm run pipeline` | Fetch trades + update prices |
| `npm run full-setup` | Complete setup from scratch |

## 🔄 Automated Data Pipeline

The app includes a GitHub Actions workflow that runs **every 6 hours** (for free!):
1. Fetches new trades from official House/Senate disclosures
2. Updates stock prices from Yahoo Finance
3. Commits the updated database

**Cost: $0** — GitHub Actions provides 2000 minutes/month free for public repos.

## 📊 Data Sources

| Source | Coverage | Cost |
|--------|----------|------|
| CongressInvests API | House + Senate, 365 days | Free (100 req/day) |
| Yahoo Finance | Stock prices, 1 year history | Free (no API key) |
| House Clerk XML | Official House disclosures | Free |
| Senate EFD | Official Senate disclosures | Free |

## 🏗️ Architecture

```
congress-trades-dashboard/
├── src/
│   ├── server.js          # Express API (all endpoints)
│   └── db.js              # SQLite database helper
├── public/
│   ├── index.html         # Single-page app
│   ├── css/styles.css     # Dark/Light theme
│   └── js/app.js          # Frontend logic
├── scripts/
│   ├── setup-db.js        # Database schema + seed
│   ├── fetch-trades.js    # Trade data pipeline
│   └── fetch-prices.js    # Price updater
├── data/
│   └── trades.db          # SQLite database
└── .github/workflows/
    └── update-data.yml    # Automated pipeline (every 6h)
```

## 🔌 API Endpoints

### Trades
- `GET /api/trades` — All trades (filterable)
- `GET /api/hot` — Hot stocks (multiple buyers)
- `GET /api/hot/:ticker` — Hot stock detail
- `GET /api/timeline` — Chronological trade feed

### Politicians
- `GET /api/politicians` — All politicians
- `GET /api/politicians/:id` — Politician detail
- `GET /api/scorecard/:id` — Full scorecard
- `GET /api/compare?ids=1,2` — Compare politicians

### Analysis
- `GET /api/heatmap` — Sector heatmap
- `GET /api/simulate` — Copy-trading simulator
- `GET /api/chart/:ticker` — Price chart data
- `GET /api/search?q=` — Search tickers/politicians
- `GET /api/stats` — Dashboard statistics

### Alerts & Export
- `POST /api/alerts/subscribe` — Subscribe to alerts
- `GET /api/export/trades` — CSV/JSON export

## 🚀 Deployment

### Railway (recommended, ~$5/mo)
1. Connect GitHub repo to Railway
2. Railway auto-detects Node.js and deploys
3. Add custom domain (optional)

### Render (~$7/mo)
1. Connect GitHub repo to Render
2. Set build command: `npm install`
3. Set start command: `npm start`

## ⚖️ Disclaimer

This dashboard uses publicly available STOCK Act disclosure data for educational and research purposes only. This is NOT financial advice. Trade disclosures may be delayed up to 45 days. Past performance does not guarantee future results.

## 📄 License

MIT
