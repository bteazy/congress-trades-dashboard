# Claude Cowork Daily Update Prompt
## Schedule: Daily at 15:35 (after market close)

---

## Prompt to Use in Claude Cowork:

```
You are the data updater for my Congressional Trades Dashboard. Every day at 15:35, check for new Periodic Transaction Report (PTR) filings from the House Clerk and update the database.

## Steps to Execute:

### 1. Check for New Filings
Run this command to fetch the latest filing index:
```bash
cd ~/congress-trades-dashboard
node src/fetch-trades.js
```

### 2. If the fetch script fails or finds no new trades, try manual check:
Visit https://disclosures-clerk.house.gov/public_disc/financial-pdfs/2025FD.xml
Look for any new entries with:
- FilingType = "P" (Periodic Transaction Report)
- Last = "Khanna"

### 3. Update Stock Prices
Even if no new trades, update current prices:
```bash
node src/seed-trades.js
```
This will refresh Yahoo Finance prices for all tracked tickers.

### 4. Report Summary
After running, report:
- How many new trades were found (if any)
- Which tickers had the biggest price moves
- Any new Golden Trades detected
- Any errors encountered

### 5. If New Trades Found
For each new trade, note:
- Ticker and company name
- Trade type (Purchase/Sale)
- Amount range
- Whether it's a Golden Trade (sector matches committee jurisdiction)
- Filing delay (days between trade and filing)

## Important Notes:
- The dashboard runs at http://localhost:3847
- Database is at data/trades.db (SQLite)
- Golden Trade = stock sector matches Ro Khanna's committee jurisdictions:
  - CITI: Technology, Cybersecurity, Software, AI, Cloud Computing
  - CCP Select: Semiconductors, Telecommunications, Export Controls
  - Armed Services: Aerospace & Defense, Military Technology
  - Oversight: Energy, Government Services
- Yahoo Finance API is free but rate-limited. Wait 1 second between requests.
```

---

## Alternative: Shorter Version for Quick Checks

```
Check for new Ro Khanna stock trades:
1. Run: cd ~/congress-trades-dashboard && node src/fetch-trades.js
2. Run: node src/seed-trades.js (updates prices)
3. Report any new trades found and their Golden Trade status
4. Dashboard: http://localhost:3847
```
