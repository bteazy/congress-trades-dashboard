/**
 * CongressTrades Dashboard v2.0 - Frontend Application
 */

// ============================================================
// STATE & CONFIG
// ============================================================
const state = {
  currentView: 'hot',
  tradesPage: 0,
  tradesPerPage: 30,
};

const API = '';

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupThemeToggle();
  setupSearch();
  setupFilters();
  
  // Load initial view
  await loadHotStocks();
});

// ============================================================
// NAVIGATION
// ============================================================
function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const viewMap = {
    'hot': 'hotView',
    'hot-detail': 'hotDetailView',
    'trades': 'tradesView',
    'politicians': 'politiciansView',
    'scorecard': 'scorecardView',
    'timeline': 'timelineView',
    'heatmap': 'heatmapView',
    'simulator': 'simulatorView',
    'alerts': 'alertsView',
    'compare': 'compareView',
  };

  const el = document.getElementById(viewMap[view]);
  if (el) el.classList.add('active');

  // Load data for view
  switch(view) {
    case 'hot': loadHotStocks(); break;
    case 'trades': loadTrades(); break;
    case 'politicians': loadPoliticians(); break;
    case 'timeline': loadTimeline(); break;
    case 'heatmap': loadHeatmap(); break;
    case 'simulator': loadSimulatorPoliticians(); break;
  }
}
window.switchView = switchView;

// ============================================================
// THEME TOGGLE
// ============================================================
function setupThemeToggle() {
  const btn = document.getElementById('themeToggle');
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  btn.textContent = saved === 'dark' ? '🌙' : '☀️';

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    btn.textContent = next === 'dark' ? '🌙' : '☀️';
  });
}

// ============================================================
// SEARCH
// ============================================================
function setupSearch() {
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  let timeout;

  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim();
    if (q.length < 2) { results.classList.add('hidden'); return; }

    timeout = setTimeout(async () => {
      const res = await fetch(`${API}/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      
      let html = '';
      data.politicians?.forEach(p => {
        html += `<div class="search-result-item" onclick="showScorecard(${p.id})">
          👤 ${p.full_name} (${p.party}-${p.state}) - ${p.chamber}
        </div>`;
      });
      data.tickers?.forEach(t => {
        html += `<div class="search-result-item" onclick="showHotDetail('${t.ticker}')">
          📈 ${t.ticker} - ${t.name} (${t.trade_count} trades)
          ${t.etoro_link ? `<a href="${t.etoro_link}" target="_blank" class="etoro-link" onclick="event.stopPropagation()">eToro ↗</a>` : ''}
        </div>`;
      });

      results.innerHTML = html || '<div class="search-result-item text-muted">No results</div>';
      results.classList.remove('hidden');
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) results.classList.add('hidden');
  });
}

// ============================================================
// FILTERS
// ============================================================
function setupFilters() {
  document.getElementById('hotDays')?.addEventListener('change', loadHotStocks);
  document.getElementById('filterAssetType')?.addEventListener('change', loadTrades);
  document.getElementById('filterTradeType')?.addEventListener('change', loadTrades);
  document.getElementById('filterGolden')?.addEventListener('change', loadTrades);
  document.getElementById('filterChamber')?.addEventListener('change', loadPoliticians);
  document.getElementById('filterParty')?.addEventListener('change', loadPoliticians);
  document.getElementById('sortPoliticians')?.addEventListener('change', loadPoliticians);
  document.getElementById('timelineDays')?.addEventListener('change', loadTimeline);
  document.getElementById('heatmapDays')?.addEventListener('change', loadHeatmap);
  document.getElementById('exportCsv')?.addEventListener('click', exportCsv);
  document.getElementById('runSimulation')?.addEventListener('click', runSimulation);
  document.getElementById('subscribeAlert')?.addEventListener('click', subscribeAlert);
}

// ============================================================
// HOT STOCKS 🔥
// ============================================================
async function loadHotStocks() {
  const days = document.getElementById('hotDays')?.value || 60;
  const container = document.getElementById('hotStocksList');
  container.innerHTML = '<div class="loading">Loading hot stocks...</div>';

  const res = await fetch(`${API}/api/hot?days=${days}&min_buyers=2`);
  const stocks = await res.json();

  if (!stocks.length) {
    container.innerHTML = '<div class="empty-state"><h3>No hot stocks found</h3><p>Try expanding the time range</p></div>';
    return;
  }

  container.innerHTML = stocks.map(s => `
    <div class="hot-stock-card ${s.golden_count > 0 ? 'golden' : ''}" onclick="showHotDetail('${s.ticker}')">
      <div class="hot-stock-header">
        <span class="hot-stock-ticker">${s.ticker} ${s.golden_count > 0 ? '🏆' : ''}</span>
        <span class="hot-stock-buyers"><strong>${s.buyer_count}</strong> politicians</span>
      </div>
      <div class="hot-stock-company">${s.company_name || ''}</div>
      <div class="hot-stock-meta">
        <span>${s.trade_count} trades</span>
        <span>${s.sector || ''}</span>
        <span class="hot-stock-return ${(s.avg_return||0) >= 0 ? 'positive' : 'negative'}">
          ${s.avg_return != null ? formatPercent(s.avg_return) : '—'}
        </span>
      </div>
      ${s.etoro_link ? `<a href="${s.etoro_link}" target="_blank" class="etoro-link" onclick="event.stopPropagation()">Trade on eToro ↗</a>` : ''}
    </div>
  `).join('');
}

async function showHotDetail(ticker) {
  switchView('hot-detail');
  const container = document.getElementById('hotDetailContent');
  container.innerHTML = '<div class="loading">Loading...</div>';

  const res = await fetch(`${API}/api/hot/${ticker}?days=180`);
  const data = await res.json();

  container.innerHTML = `
    <div class="scorecard-header">
      <div>
        <h2 class="scorecard-name">${ticker} ${data.stock?.company_name ? `- ${data.stock.company_name}` : ''}</h2>
        <p class="scorecard-meta">
          ${data.stock?.last_price ? `$${data.stock.last_price.toFixed(2)}` : ''} 
          ${data.stock?.exchange || ''}
          ${data.etoro_link ? `<a href="${data.etoro_link}" target="_blank" class="etoro-link">Trade on eToro ↗</a>` : ''}
        </p>
      </div>
    </div>
    <h3 style="margin: 20px 0 12px">Politicians who bought ${ticker}</h3>
    <div class="trades-table">
      ${data.trades.map(t => `
        <div class="trade-row ${t.is_golden_trade ? 'golden' : ''}">
          <span class="ticker">${t.full_name} ${t.is_golden_trade ? '<span class="golden-badge">🏆</span>' : ''}</span>
          <span class="politician">${t.party}-${t.state} | ${t.chamber}</span>
          <span class="type purchase">${formatDate(t.trade_date)}</span>
          <span>${t.amount_text || ''}</span>
          <span class="change ${(t.percent_change||0) >= 0 ? 'positive' : 'negative'}">
            ${t.percent_change != null ? formatPercent(t.percent_change) : '—'}
          </span>
          <span class="text-muted" title="3-month avg return">
            3M: ${t.politician_3mo_return != null ? formatPercent(t.politician_3mo_return) : '—'}
          </span>
        </div>
      `).join('')}
    </div>
  `;
}
window.showHotDetail = showHotDetail;

// ============================================================
// TRADES
// ============================================================
async function loadTrades() {
  const container = document.getElementById('tradesTable');
  container.innerHTML = '<div class="loading">Loading trades...</div>';

  const params = new URLSearchParams({
    limit: state.tradesPerPage,
    offset: state.tradesPage * state.tradesPerPage,
    days: 365,
  });

  const assetType = document.getElementById('filterAssetType')?.value;
  const tradeType = document.getElementById('filterTradeType')?.value;
  const goldenOnly = document.getElementById('filterGolden')?.checked;

  if (assetType) params.set('asset_type', assetType);
  if (tradeType) params.set('trade_type', tradeType);
  if (goldenOnly) params.set('golden_only', '1');

  const res = await fetch(`${API}/api/trades?${params}`);
  const data = await res.json();

  if (!data.trades.length) {
    container.innerHTML = '<div class="empty-state"><h3>No trades found</h3></div>';
    return;
  }

  container.innerHTML = data.trades.map(t => `
    <div class="trade-row ${t.is_golden_trade ? 'golden' : ''}">
      <span class="ticker">
        ${t.ticker || '—'}${t.is_golden_trade ? '<span class="golden-badge">🏆</span>' : ''}
        ${t.ticker && t.asset_type === 'Stock Option' ? ' 📋' : ''}
      </span>
      <span>
        <span class="politician">${t.full_name}</span>
        <br><span class="text-muted" style="font-size:12px">${t.asset_name || ''}</span>
      </span>
      <span class="type ${t.trade_type?.toLowerCase().includes('purchase') ? 'purchase' : 'sale'}">${t.trade_type}</span>
      <span>${formatDate(t.trade_date)}</span>
      <span class="text-muted">${t.amount_text || ''}</span>
      <span class="change ${(t.percent_change||0) >= 0 ? 'positive' : 'negative'}">
        ${t.percent_change != null ? formatPercent(t.percent_change) : '—'}
      </span>
    </div>
  `).join('');

  // Pagination
  const totalPages = Math.ceil(data.total / state.tradesPerPage);
  const pagination = document.getElementById('tradesPagination');
  if (totalPages > 1) {
    let html = '';
    for (let i = 0; i < Math.min(totalPages, 10); i++) {
      html += `<button class="${i === state.tradesPage ? 'active' : ''}" onclick="goToPage(${i})">${i + 1}</button>`;
    }
    pagination.innerHTML = html;
  } else {
    pagination.innerHTML = '';
  }
}

window.goToPage = function(page) {
  state.tradesPage = page;
  loadTrades();
};

// ============================================================
// POLITICIANS
// ============================================================
async function loadPoliticians() {
  const container = document.getElementById('politiciansList');
  container.innerHTML = '<div class="loading">Loading politicians...</div>';

  const params = new URLSearchParams({ limit: 100 });
  const chamber = document.getElementById('filterChamber')?.value;
  const party = document.getElementById('filterParty')?.value;
  const sort = document.getElementById('sortPoliticians')?.value;

  if (chamber) params.set('chamber', chamber);
  if (party) params.set('party', party);
  if (sort) params.set('sort', sort);

  const res = await fetch(`${API}/api/politicians?${params}`);
  const politicians = await res.json();

  container.innerHTML = politicians.map(p => `
    <div class="politician-card" onclick="showScorecard(${p.id})">
      <div class="politician-card-header">
        <div class="politician-avatar">${(p.first_name||'?')[0]}</div>
        <div>
          <div class="politician-card-name">${p.full_name}</div>
          <div class="politician-card-party">${p.party === 'D' ? 'Democrat' : p.party === 'R' ? 'Republican' : p.party || '?'} · ${p.state || '?'} · ${p.chamber}</div>
        </div>
      </div>
      <div class="politician-card-stats">
        <div class="politician-stat">
          <div class="politician-stat-value">${p.trade_count || 0}</div>
          <div class="politician-stat-label">Trades</div>
        </div>
        <div class="politician-stat">
          <div class="politician-stat-value ${(p.avg_return||0) >= 0 ? 'text-green' : 'text-red'}">
            ${p.avg_return != null ? formatPercent(p.avg_return) : '—'}
          </div>
          <div class="politician-stat-label">Avg Return</div>
        </div>
        <div class="politician-stat">
          <div class="politician-stat-value text-gold">${p.golden_count || 0}</div>
          <div class="politician-stat-label">Golden</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// SCORECARD
// ============================================================
async function showScorecard(id) {
  switchView('scorecard');
  const container = document.getElementById('scorecardContent');
  container.innerHTML = '<div class="loading">Loading scorecard...</div>';

  const res = await fetch(`${API}/api/scorecard/${id}`);
  const data = await res.json();
  const { politician: p, stats: s, best_sector, sectors, recent_trades } = data;

  container.innerHTML = `
    <div class="scorecard">
      <div class="scorecard-header">
        <div class="politician-avatar" style="width:64px;height:64px;font-size:28px">${(p.first_name||'?')[0]}</div>
        <div>
          <h2 class="scorecard-name">${p.full_name}</h2>
          <p class="scorecard-meta">${p.party === 'D' ? 'Democrat' : 'Republican'} · ${p.state} · ${p.chamber}</p>
        </div>
      </div>

      <div class="scorecard-stats">
        <div class="stat-card">
          <div class="stat-card-value">${s.total_trades || 0}</div>
          <div class="stat-card-label">Total Trades</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value" style="color: var(--green)">${s.win_rate?.toFixed(0) || 0}%</div>
          <div class="stat-card-label">Win Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value ${(s.avg_return||0) >= 0 ? '' : 'text-red'}">${s.avg_return != null ? formatPercent(s.avg_return) : '—'}</div>
          <div class="stat-card-label">Avg Return</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value text-gold">${s.golden_trades || 0}</div>
          <div class="stat-card-label">Golden Trades</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value text-green">${s.best_trade_return != null ? formatPercent(s.best_trade_return) : '—'}</div>
          <div class="stat-card-label">Best Trade</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value text-red">${s.worst_trade_return != null ? formatPercent(s.worst_trade_return) : '—'}</div>
          <div class="stat-card-label">Worst Trade</div>
        </div>
      </div>

      ${best_sector ? `<p style="margin-bottom:20px">🏆 Best Sector: <strong>${best_sector.sector}</strong> (${formatPercent(best_sector.avg_return)} avg, ${best_sector.count} trades)</p>` : ''}

      <h3 style="margin-bottom:12px">Recent Trades</h3>
      <div class="trades-table">
        ${(recent_trades || []).map(t => `
          <div class="trade-row ${t.is_golden_trade ? 'golden' : ''}">
            <span class="ticker">${t.ticker || '—'}${t.is_golden_trade ? '<span class="golden-badge">🏆</span>' : ''}</span>
            <span>${t.asset_name || ''}</span>
            <span class="type ${t.trade_type?.toLowerCase().includes('purchase') ? 'purchase' : 'sale'}">${t.trade_type}</span>
            <span>${formatDate(t.trade_date)}</span>
            <span>${t.amount_text || ''}</span>
            <span class="change ${(t.percent_change||0) >= 0 ? 'positive' : 'negative'}">
              ${t.percent_change != null ? formatPercent(t.percent_change) : '—'}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
window.showScorecard = showScorecard;

// ============================================================
// TIMELINE
// ============================================================
async function loadTimeline() {
  const days = document.getElementById('timelineDays')?.value || 30;
  const container = document.getElementById('timelineContent');
  container.innerHTML = '<div class="loading">Loading timeline...</div>';

  const res = await fetch(`${API}/api/timeline?days=${days}&limit=100`);
  const trades = await res.json();

  if (!trades.length) {
    container.innerHTML = '<div class="empty-state"><h3>No trades in this period</h3></div>';
    return;
  }

  let currentDate = '';
  container.innerHTML = trades.map(t => {
    const date = t.trade_date;
    let dateHeader = '';
    if (date !== currentDate) {
      currentDate = date;
      dateHeader = `<div class="timeline-date" style="margin-top:16px;margin-bottom:4px;font-weight:600">${formatDate(date)}</div>`;
    }
    const isSale = t.trade_type?.toLowerCase().includes('sale');
    return `
      ${dateHeader}
      <div class="timeline-item ${t.is_golden_trade ? 'golden' : ''} ${isSale ? 'sale' : ''}">
        <div class="timeline-content">
          <div class="timeline-left">
            <span class="timeline-ticker">${t.ticker || '—'} ${t.is_golden_trade ? '🏆' : ''}</span>
            <span class="timeline-politician">${t.full_name} (${t.party}-${t.state})</span>
          </div>
          <div class="timeline-right">
            <span class="timeline-type ${isSale ? 'text-red' : 'text-green'}">${t.trade_type}</span>
            <span class="timeline-amount">${t.amount_text || ''}</span>
            ${t.ticker ? `<a href="https://www.etoro.com/markets/${t.ticker.toLowerCase()}" target="_blank" class="etoro-link">eToro ↗</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// HEATMAP
// ============================================================
async function loadHeatmap() {
  const days = document.getElementById('heatmapDays')?.value || 30;
  const container = document.getElementById('heatmapContent');
  container.innerHTML = '<div class="loading">Loading heatmap...</div>';

  const res = await fetch(`${API}/api/heatmap?days=${days}`);
  const sectors = await res.json();

  if (!sectors.length) {
    container.innerHTML = '<div class="empty-state"><h3>No sector data</h3></div>';
    return;
  }

  const maxTrades = Math.max(...sectors.map(s => s.trade_count));

  container.innerHTML = sectors.map(s => {
    const intensity = s.trade_count / maxTrades;
    const cls = intensity > 0.6 ? 'hot' : intensity > 0.3 ? 'warm' : '';
    return `
      <div class="heatmap-cell ${cls}">
        <div class="heatmap-sector">${s.sector}</div>
        <div class="heatmap-trades">${s.trade_count}</div>
        <div class="heatmap-meta">
          ${s.buys} buys · ${s.sells} sells<br>
          ${s.unique_traders} traders
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// SIMULATOR
// ============================================================
async function loadSimulatorPoliticians() {
  const select = document.getElementById('simPolitician');
  if (!select || select.options.length > 1) return;

  const res = await fetch(`${API}/api/politicians?limit=50&sort=trades`);
  const politicians = await res.json();
  
  politicians.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.full_name} (${p.trade_count} trades)`;
    select.appendChild(opt);
  });
}

async function runSimulation() {
  const capital = document.getElementById('simCapital')?.value || 10000;
  const days = document.getElementById('simDays')?.value || 365;
  const politicianId = document.getElementById('simPolitician')?.value || '';
  const container = document.getElementById('simulatorResults');
  container.innerHTML = '<div class="loading">Running simulation...</div>';

  const params = new URLSearchParams({ start_capital: capital, days });
  if (politicianId) params.set('politician_id', politicianId);

  const res = await fetch(`${API}/api/simulate?${params}`);
  const data = await res.json();

  const returnClass = data.total_return >= 0 ? 'positive' : 'negative';

  container.innerHTML = `
    <div class="simulator-results">
      <div class="sim-summary">
        <div class="sim-card">
          <div class="sim-card-value">$${Number(capital).toLocaleString()}</div>
          <div class="sim-card-label">Start Capital</div>
        </div>
        <div class="sim-card">
          <div class="sim-card-value ${returnClass}">$${data.final_value?.toLocaleString()}</div>
          <div class="sim-card-label">Final Value</div>
        </div>
        <div class="sim-card">
          <div class="sim-card-value ${returnClass}">${formatPercent(data.total_return)}</div>
          <div class="sim-card-label">Total Return</div>
        </div>
        <div class="sim-card">
          <div class="sim-card-value">${formatPercent(data.sp500_return)}</div>
          <div class="sim-card-label">S&P 500 (same period)</div>
        </div>
        <div class="sim-card">
          <div class="sim-card-value">${data.num_trades}</div>
          <div class="sim-card-label">Trades Copied</div>
        </div>
        <div class="sim-card">
          <div class="sim-card-value">${formatPercent(data.avg_trade_return)}</div>
          <div class="sim-card-label">Avg Trade Return</div>
        </div>
      </div>

      <h3 style="margin:20px 0 12px">Trade Log</h3>
      <div class="trades-table">
        ${(data.trades || []).slice(0, 20).map(t => `
          <div class="trade-row">
            <span class="ticker">${t.ticker || '—'}</span>
            <span class="politician">${t.politician || ''}</span>
            <span>${formatDate(t.trade_date)}</span>
            <span class="change ${t.return_pct >= 0 ? 'positive' : 'negative'}">${formatPercent(t.return_pct)}</span>
            <span class="${Number(t.profit) >= 0 ? 'text-green' : 'text-red'}">$${t.profit}</span>
            <span>${t.etoro_link ? `<a href="${t.etoro_link}" target="_blank" class="etoro-link">eToro ↗</a>` : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================
// ALERTS
// ============================================================
async function subscribeAlert() {
  const email = document.getElementById('alertEmail')?.value;
  const alertType = document.getElementById('alertType')?.value;

  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address');
    return;
  }

  const res = await fetch(`${API}/api/alerts/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, alert_type: alertType })
  });

  const data = await res.json();
  if (data.success) {
    alert('✅ Subscribed! You will receive email alerts for new trades.');
    document.getElementById('alertEmail').value = '';
  }
}

// ============================================================
// EXPORT
// ============================================================
function exportCsv() {
  window.open(`${API}/api/export/trades?format=csv&days=365`, '_blank');
}

// ============================================================
// UTILITIES
// ============================================================
function formatPercent(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${Number(value).toFixed(1)}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function formatCurrency(amount) {
  if (!amount) return '$0';
  return '$' + Number(amount).toLocaleString();
}
