# 🏛️ Congressional Trades Dashboard

A local, self-hosted dashboard for tracking congressional stock trades with **Golden Trade** detection. Inspired by [Altoneer](https://altoneer.com).

![Dark Theme](https://img.shields.io/badge/theme-dark-1c2128)
![Node.js](https://img.shields.io/badge/node-18+-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Trade Tracking**: View all stock trades by members of Congress
- **Golden Trade Detection**: Flags trades where the stock's sector matches the politician's committee jurisdiction
- **Interactive Charts**: TradingView Lightweight Charts with S&P 500 comparison
- **Performance Metrics**: % change since trade vs S&P 500
- **Committee Mapping**: See which committees have jurisdiction over which sectors
- **Dark Theme UI**: Minimalist design inspired by Altoneer
- **Local-First**: All data stored locally in SQLite, no cloud dependencies
- **Daily Updates**: Claude Cowork prompt for automated daily data pulls

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create database and seed Ro Khanna data
npm run setup

# 3. Seed known trades and fetch stock prices
node src/seed-trades.js

# 4. Start the dashboard
npm start
# → Opens at http://localhost:3847
```

## Architecture

```
congress-trades-dashboard/
├── public/              # Frontend (vanilla JS, dark theme)
│   ├── index.html       # Main HTML structure
│   ├── styles.css       # Dark theme CSS (Altoneer-inspired)
│   └── app.js           # Frontend logic, charts, navigation
├── src/
│   ├── server.js        # Express API server (port 3847)
│   ├── setup-db.js      # SQLite schema + seed data
│   ├── seed-trades.js   # Pre-populate known trades + fetch prices
│   └── fetch-trades.js  # House Clerk XML/PDF parser
├── data/
│   ├── trades.db        # SQLite database (auto-created)
│   └── cache/           # Cached XML/PDF files
├── CLAUDE_COWORK_PROMPT.md  # Daily update automation
├── package.json
└── README.md
```

## Data Sources

| Source | What | Cost |
|--------|------|------|
| [House Clerk](https://disclosures-clerk.house.gov) | PTR filings (XML index + PDF) | Free |
| [Yahoo Finance](https://finance.yahoo.com) | Stock prices, sector/industry | Free |

## Golden Trade Logic

A trade is flagged as "Golden" when:

1. The stock belongs to a sector (e.g., "Semiconductors")
2. The politician sits on a committee with jurisdiction over that sector
3. → The politician may have non-public information about that industry

**Ro Khanna's Committee Jurisdictions:**

| Committee | Sectors |
|-----------|---------|
| CITI (Ranking Member) | Technology, Cybersecurity, Software, AI, Cloud Computing, Defense IT |
| CCP Select (Ranking Member) | Semiconductors, Telecommunications, Export Controls, Supply Chain |
| Armed Services | Aerospace & Defense, Military Technology |
| Oversight | Energy, Government Services |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/politicians` | List all politicians |
| GET | `/api/politicians/:id` | Politician detail + committees |
| GET | `/api/trades` | All trades (filterable) |
| GET | `/api/trades/:id` | Single trade detail |
| GET | `/api/chart/:ticker` | Price history for charts |
| GET | `/api/stats/:politician_id` | Profitability statistics |
| POST | `/api/fetch-live-price/:ticker` | Refresh price from Yahoo |

**Query Parameters for `/api/trades`:**
- `politician_id` - Filter by politician
- `ticker` - Filter by stock ticker
- `golden_only=1` - Only Golden Trades
- `trade_type` - Purchase, Sale, etc.
- `limit` / `offset` - Pagination

## Daily Updates (Claude Cowork)

Set up Claude Cowork to run at **15:35 daily** (after market close):

```
Check for new Ro Khanna stock trades:
1. Run: cd ~/congress-trades-dashboard && node src/fetch-trades.js
2. Run: node src/seed-trades.js (updates prices)
3. Report any new trades found and their Golden Trade status
```

See `CLAUDE_COWORK_PROMPT.md` for the full prompt.

## Expanding Beyond Ro Khanna

To add more politicians:

1. Add to `politicians` table in `setup-db.js`
2. Add their committees and sector mappings
3. Add their name to `TARGET_POLITICIANS` in `fetch-trades.js`
4. Run `npm run fetch`

## Tech Stack

- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: Vanilla JS, TradingView Lightweight Charts
- **Database**: SQLite (WAL mode)
- **Data**: House Clerk XML/PDF, Yahoo Finance API
- **Styling**: Custom CSS (dark theme, no frameworks)

## License

MIT - For educational and research purposes only. Not financial advice.
