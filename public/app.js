/**
 * Congressional Trades Dashboard - Frontend Application
 * Handles navigation, data fetching, chart rendering, and trade display
 */

// ============================================================
// STATE
// ============================================================

const state = {
  currentView: 'trades',
  currentTrade: null,
  politician: null,
  trades: [],
  chart: null,
  chartSeries: null,
  sp500Series: null,
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupSearch();
  setupTimeframeButtons();
  setupFilters();
  
  // Load initial data
  await loadPolitician(1); // Ro Khanna (id=1)
  await loadTrades();
  
  // Show first trade if available
  if (state.trades.length > 0) {
    showTradeDetail(state.trades[0]);
  }
});

// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  state.currentView = view;
  
  // Update nav
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
  
  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  
  switch (view) {
    case 'trades':
      document.getElementById('tradeDetailView').classList.add('active');
      break;
    case 'politicians':
      document.getElementById('tradesListView').classList.add('active');
      loadTradesList();
      break;
    case 'golden':
      document.getElementById('goldenView').classList.add('active');
      loadGoldenTrades();
      break;
  }
}

// ============================================================
// DATA LOADING
// ============================================================

async function loadPolitician(id) {
  try {
    const res = await fetch(`/api/politicians/${id}`);
    const data = await res.json();
    state.politician = data;
    renderPoliticianCard(data);
  } catch (err) {
    console.error('Failed to load politician:', err);
  }
}

async function loadTrades(filters = {}) {
  try {
    const params = new URLSearchParams({
      politician_id: 1,
      limit: 50,
      ...filters
    });
    const res = await fetch(`/api/trades?${params}`);
    const data = await res.json();
    state.trades = data.trades;
    return data.trades;
  } catch (err) {
    console.error('Failed to load trades:', err);
    return [];
  }
}

async function loadChartData(ticker, range = '1y') {
  try {
    const res = await fetch(`/api/chart/${ticker}?range=${range}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to load chart:', err);
    return null;
  }
}

// ============================================================
// RENDERING - POLITICIAN CARD
// ============================================================

function renderPoliticianCard(data) {
  document.getElementById('politicianPhoto').src = data.photo_url || '';
  document.getElementById('politicianPhoto').alt = data.full_name;
  document.getElementById('politicianName').textContent = `${data.full_name} →`;
  document.getElementById('politicianParty').textContent = 
    `${data.party === 'D' ? 'Democrat' : data.party === 'R' ? 'Republican' : 'Independent'} / ${data.state}`;
  document.getElementById('tradeCount').textContent = data.trade_count || 0;
  document.getElementById('chamberLabel').textContent = data.chamber || 'House';
  document.getElementById('tradeVolume').textContent = formatCurrency(data.total_volume || 0);
  document.getElementById('lastTradeDate').textContent = data.last_trade_date || '-';
  
  if (data.twitter_handle) {
    document.getElementById('twitterLink').href = `https://x.com/${data.twitter_handle}`;
  }
  
  // Render committees
  renderCommittees(data.committees || []);
}

function renderCommittees(committees) {
  const container = document.getElementById('committeesList');
  container.innerHTML = committees.map(c => `
    <div class="committee-item">
      <div class="committee-name">
        <span class="icon">🏛️</span>
        <h4>${c.short_name || c.name}</h4>
      </div>
      <div class="committee-meta">
        <span><span class="value">${c.role || 'Member'}</span></span>
      </div>
      <div class="committee-sectors">
        ${(c.sectors || '').split(', ').map(s => `<span>• ${s}</span>`).join(' ')}
      </div>
    </div>
  `).join('');
}

// ============================================================
// RENDERING - TRADE DETAIL
// ============================================================

async function showTradeDetail(trade) {
  state.currentTrade = trade;
  
  // Switch to detail view
  document.getElementById('tradeDetailView').classList.add('active');
  
  // Update header
  document.getElementById('tradeTicker').textContent = trade.ticker;
  document.getElementById('tradeCompany').textContent = trade.company_name || '';
  document.getElementById('tradeCurrentPrice').textContent = 
    trade.price_at_trade ? trade.price_at_trade.toFixed(2) : '—';
  
  // Trade info
  const typeClass = trade.trade_type?.toLowerCase().includes('purchase') ? 'purchase' : 'sale';
  document.getElementById('tradeInfo').innerHTML = `
    <span class="trade-type-badge ${typeClass}">${trade.trade_type}</span>
    of ${trade.amount_text || 'undisclosed'} on ${formatDate(trade.trade_date)}
  `;
  
  // Performance ticker label
  document.getElementById('perfTicker').textContent = trade.ticker;
  
  // Performance values
  const perfChange = document.getElementById('perfChange');
  if (trade.percent_change != null) {
    perfChange.textContent = formatPercent(trade.percent_change);
    perfChange.className = `perf-value ${trade.percent_change >= 0 ? 'positive' : 'negative'}`;
  } else {
    perfChange.textContent = '—';
    perfChange.className = 'perf-value';
  }
  
  const perfSP500 = document.getElementById('perfSP500');
  if (trade.sp500_change != null) {
    perfSP500.textContent = formatPercent(trade.sp500_change);
    perfSP500.className = `perf-value ${trade.sp500_change >= 0 ? 'positive' : 'negative'}`;
  } else {
    perfSP500.textContent = '—';
    perfSP500.className = 'perf-value';
  }
  
  // Golden Trade banner
  const goldenBanner = document.getElementById('goldenBanner');
  if (trade.is_golden_trade) {
    goldenBanner.classList.remove('hidden');
    renderGoldenReasons(trade);
  } else {
    goldenBanner.classList.add('hidden');
  }
  
  // Load and render chart
  await renderChart(trade.ticker, '1y', trade.trade_date);
}

async function renderGoldenReasons(trade) {
  const container = document.getElementById('goldenReasons');
  
  try {
    const reason = trade.golden_reason ? JSON.parse(trade.golden_reason) : null;
    if (reason) {
      container.innerHTML = `
        <div style="margin-bottom: 12px;">
          <strong>${reason.committee_sector || reason.sector} Jurisdiction</strong>
        </div>
        <p>• ${trade.ticker} is a <span class="highlight">${reason.industry || reason.sector}</span> company</p>
        <p>• The <span class="highlight">${reason.committee}</span> has direct jurisdiction over <span class="highlight">${reason.committee_sector}</span></p>
      `;
    }
  } catch (err) {
    container.innerHTML = '<p>Committee jurisdiction overlap detected.</p>';
  }
}

// ============================================================
// CHART RENDERING (TradingView Lightweight Charts)
// ============================================================

async function renderChart(ticker, range = '1y', tradeDate = null) {
  const chartContainer = document.getElementById('priceChart');
  chartContainer.innerHTML = '';
  
  const chartData = await loadChartData(ticker, range);
  if (!chartData || !chartData.history.length) {
    chartContainer.innerHTML = '<div class="empty-state"><p>No price data available</p></div>';
    return;
  }
  
  // Create chart
  const chart = LightweightCharts.createChart(chartContainer, {
    width: chartContainer.clientWidth,
    height: 300,
    layout: {
      background: { type: 'solid', color: '#1c2128' },
      textColor: '#8b949e',
    },
    grid: {
      vertLines: { color: '#21262d' },
      horzLines: { color: '#21262d' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#30363d',
    },
    timeScale: {
      borderColor: '#30363d',
      timeVisible: false,
    },
  });
  
  // Stock price line
  const lineSeries = chart.addLineSeries({
    color: '#4ecdc4',
    lineWidth: 2,
    priceLineVisible: false,
  });
  
  const lineData = chartData.history.map(d => ({
    time: d.date,
    value: d.close,
  }));
  lineSeries.setData(lineData);
  
  // S&P 500 comparison (scaled to stock price)
  if (chartData.sp500 && chartData.sp500.length > 0) {
    const sp500Series = chart.addLineSeries({
      color: '#8b949e',
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceLineVisible: false,
    });
    
    // Scale S&P 500 relative to stock's first price
    const stockFirst = lineData[0]?.value || 1;
    const sp500First = chartData.sp500[0]?.close || 1;
    const scaleFactor = stockFirst / sp500First;
    
    const sp500Data = chartData.sp500.map(d => ({
      time: d.date,
      value: d.close * scaleFactor,
    }));
    sp500Series.setData(sp500Data);
  }
  
  // Add trade date marker
  if (tradeDate) {
    const markers = [{
      time: tradeDate,
      position: 'belowBar',
      color: '#4ecdc4',
      shape: 'circle',
      text: 'T',
    }];
    lineSeries.setMarkers(markers);
  }
  
  // Resize handler
  const resizeObserver = new ResizeObserver(() => {
    chart.applyOptions({ width: chartContainer.clientWidth });
  });
  resizeObserver.observe(chartContainer);
  
  state.chart = chart;
  state.chartSeries = lineSeries;
}

// ============================================================
// TRADES LIST VIEW
// ============================================================

async function loadTradesList(filters = {}) {
  const trades = await loadTrades(filters);
  renderTradesTable('tradesTable', trades);
}

async function loadGoldenTrades() {
  const trades = await loadTrades({ golden_only: '1' });
  renderTradesTable('goldenTradesTable', trades);
}

function renderTradesTable(containerId, trades) {
  const container = document.getElementById(containerId);
  
  if (!trades || trades.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No trades found</h3>
        <p>Run "npm run fetch" to pull latest trade data from House Clerk.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = trades.map(t => {
    const typeClass = t.trade_type?.toLowerCase().includes('purchase') ? 'purchase' : 'sale';
    const changeClass = t.percent_change >= 0 ? 'positive' : 'negative';
    const goldenClass = t.is_golden_trade ? 'golden' : '';
    
    return `
      <div class="trade-row ${goldenClass}" onclick="showTradeDetail(${JSON.stringify(t).replace(/"/g, '&quot;')})">
        <span class="ticker">${t.ticker}${t.is_golden_trade ? '<span class="golden-badge">🏆</span>' : ''}</span>
        <span class="company">${t.company_name || ''}</span>
        <span class="type ${typeClass}">${t.trade_type || ''}</span>
        <span class="date">${formatDate(t.trade_date)}</span>
        <span class="amount">${t.amount_text || ''}</span>
        <span class="change ${changeClass}">${t.percent_change != null ? formatPercent(t.percent_change) : '—'}</span>
      </div>
    `;
  }).join('');
}

// ============================================================
// SEARCH
// ============================================================

function setupSearch() {
  const input = document.getElementById('searchInput');
  let timeout;
  
  input.addEventListener('input', (e) => {
    clearTimeout(timeout);
    timeout = setTimeout(async () => {
      const query = e.target.value.trim().toUpperCase();
      if (query.length >= 1) {
        const trades = await loadTrades({ ticker: query });
        if (trades.length > 0) {
          switchView('politicians');
          renderTradesTable('tradesTable', trades);
        }
      } else {
        loadTradesList();
      }
    }, 300);
  });
}

// ============================================================
// TIMEFRAME BUTTONS
// ============================================================

function setupTimeframeButtons() {
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const range = btn.dataset.range;
      if (state.currentTrade) {
        await renderChart(state.currentTrade.ticker, range, state.currentTrade.trade_date);
      }
    });
  });
}

// ============================================================
// FILTERS
// ============================================================

function setupFilters() {
  document.getElementById('filterType')?.addEventListener('change', (e) => {
    loadTradesList({ trade_type: e.target.value });
  });
  
  document.getElementById('filterGolden')?.addEventListener('change', (e) => {
    loadTradesList({ golden_only: e.target.checked ? '1' : '' });
  });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function formatCurrency(amount) {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount}`;
}

function formatPercent(value) {
  if (value == null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    });
  } catch {
    return dateStr;
  }
}

// Make showTradeDetail available globally for onclick handlers
window.showTradeDetail = async function(trade) {
  // If trade is passed as object from inline onclick
  if (typeof trade === 'object') {
    state.currentTrade = trade;
    switchView('trades');
    
    // Update header
    document.getElementById('tradeTicker').textContent = trade.ticker;
    document.getElementById('tradeCompany').textContent = trade.company_name || '';
    document.getElementById('tradeCurrentPrice').textContent = 
      trade.price_at_trade ? trade.price_at_trade.toFixed(2) : '—';
    
    // Trade info
    const typeClass = trade.trade_type?.toLowerCase().includes('purchase') ? 'purchase' : 'sale';
    document.getElementById('tradeInfo').innerHTML = `
      <span class="trade-type-badge ${typeClass}">${trade.trade_type}</span>
      of ${trade.amount_text || 'undisclosed'} on ${formatDate(trade.trade_date)}
    `;
    
    // Performance ticker label
    document.getElementById('perfTicker').textContent = trade.ticker;
    
    // Performance values
    const perfChange = document.getElementById('perfChange');
    if (trade.percent_change != null) {
      perfChange.textContent = formatPercent(trade.percent_change);
      perfChange.className = `perf-value ${trade.percent_change >= 0 ? 'positive' : 'negative'}`;
    } else {
      perfChange.textContent = '—';
      perfChange.className = 'perf-value';
    }
    
    const perfSP500 = document.getElementById('perfSP500');
    if (trade.sp500_change != null) {
      perfSP500.textContent = formatPercent(trade.sp500_change);
      perfSP500.className = `perf-value ${trade.sp500_change >= 0 ? 'positive' : 'negative'}`;
    } else {
      perfSP500.textContent = '—';
      perfSP500.className = 'perf-value';
    }
    
    // Golden Trade banner
    const goldenBanner = document.getElementById('goldenBanner');
    if (trade.is_golden_trade) {
      goldenBanner.classList.remove('hidden');
      renderGoldenReasons(trade);
    } else {
      goldenBanner.classList.add('hidden');
    }
    
    // Load and render chart
    await renderChart(trade.ticker, '1y', trade.trade_date);
  }
};
