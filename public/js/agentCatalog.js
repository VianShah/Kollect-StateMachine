// Agent Catalog screen (2026-09-16, sidebar reworked 2026-09-17) — library of
// 140+ agents, reachable from the landing page's "Agent Catalog" nav button.
// Filters are exact-match against /api/agent-catalog's facets; the search box
// calls the real semantic-search endpoint (Gemini embeddings, see
// server/lib/agentCatalogIndex.js) and degrades to substring matching if the
// index isn't ready — either way the UI just renders whatever `results`
// comes back, no separate code path.
//
// Revamped 2026-10-03 around the four services Predixion actually sells:
// Retail debt collections, Business debt collections, Cross-selling and Cold
// sales. The sidebar is a flat list of exactly those four (plus "All
// agents") and IS the service filter, so there's no separate Service
// dropdown next to it — that would just be the same filter twice. The
// dropdowns above the grid cover everything else (product, stage, objective,
// language, persona tone).
//
// Dropdown options are derived from the agents inside the current sidebar
// scope rather than a global list, so a dropdown never offers a value no
// visible agent has (Sales agents have no stage and only two products, so
// Stage disappears and Product shrinks when a Sales service is selected).
const FILTER_KEYS = ['product', 'stage', 'objective', 'language', 'persona'];
const FILTER_LABELS = { product: 'Product', stage: 'Stage', objective: 'Objective', language: 'Language', persona: 'Persona' };
// Which agent field each dropdown reads — product and language are arrays.
const AGENT_FIELD = { product: 'products', stage: 'stage', objective: 'objective', language: 'languages', persona: 'personaTone' };

let catalogFacets = null;
let catalogAllAgents = [];
let catalogFilterState = { service: '', product: '', stage: '', objective: '', language: '', persona: '' };
let catalogSearchTimer = null;
let catalogLoaded = false;
let catalogAgentsById = {}; // populated on every render so the detail modal can look an agent up by id

function agentsInScope(){
  return catalogFilterState.service
    ? catalogAllAgents.filter(a => a.service === catalogFilterState.service)
    : catalogAllAgents;
}

function filterOptions(key){
  const field = AGENT_FIELD[key];
  const values = new Set();
  agentsInScope().forEach(a => {
    const v = a[field];
    if (Array.isArray(v)) v.forEach(x => values.add(x));
    else if (v) values.add(v);
  });
  const list = [...values];
  // Stages have a meaningful order (Pre-due -> Bucket 3); everything else
  // reads best alphabetically.
  if (key === 'stage') {
    const order = (catalogFacets && catalogFacets.stages) || [];
    return list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return list.sort();
}

function initialsFor(name){
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function formatMinutes(mins){
  if (!mins) return '0 min talked';
  return `${mins.toLocaleString('en-IN')} min talked`;
}

// Shared by the card and the detail modal: stage + objective as the two
// highlighted chips (stage only exists on collections agents), products and
// languages as plain chips below.
function agentChipRows(agent){
  const highlight = [
    agent.stage ? `<span class="agent-chip agent-chip-bucket">${agent.stage}</span>` : '',
    agent.objective ? `<span class="agent-chip agent-chip-objective">${agent.objective}</span>` : '',
  ].join('');
  const products = (agent.products || []).map(p => `<span class="agent-chip">${p}</span>`).join('');
  const languages = (agent.languages || []).map(l => `<span class="agent-chip">${l}</span>`).join('');
  return `
    ${highlight ? `<div class="agent-card-chips">${highlight}</div>` : ''}
    ${products ? `<div class="agent-card-chips">${products}</div>` : ''}
    ${languages ? `<div class="agent-card-chips">${languages}</div>` : ''}`;
}

// Only a handful of agents carry bestRegion (one winner per region, picked
// from the catalog data), so this badge stays a deliberate marker rather
// than something every card has.
function bestBadge(agent){
  if (!agent.bestRegion) return '';
  return `<span class="agent-badge-best" title="Highest QC audit score among agents whose primary language is spoken in ${agent.bestRegion}">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>
    Best in ${agent.bestRegion}</span>`;
}

function clientBadge(agent){
  const text = agent.badge || agent.clientBadge || (agent.client ? `${agent.client} agent` : '');
  if (!text) return '';
  return `<span class="agent-badge-client"><span class="badge-dot"></span>${text}</span>`;
}

function renderAgentCard(agent){
  const rating = agent.rating != null
    ? `<span class="agent-rating"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>${agent.rating.toFixed(1)}</span>`
    : `<span class="agent-rating" style="color:var(--text-faint)">Unrated</span>`;
  return `
    <div class="agent-card" data-agent-id="${agent.id}">
      <div class="agent-card-top">
        <div class="agent-card-id">
          <div class="agent-avatar">${initialsFor(agent.name)}</div>
          <div>
            <div class="name">${agent.name}</div>
            <div class="usecase">${agent.service}</div>
          </div>
        </div>
        ${clientBadge(agent)}
      </div>
      ${bestBadge(agent) ? `<div>${bestBadge(agent)}</div>` : ''}
      <div class="agent-card-persona">${agent.description}</div>
      ${agentChipRows(agent)}
      <div class="agent-card-foot">
        <span>${agent.personaTone} tone</span>
        ${rating}
      </div>
      <div class="agent-card-minutes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
        ${formatMinutes(agent.minutesSpoken)}
        ${agent.appId ? `<span style="margin-left:auto; color:#38bdf8; font-weight:600; display:inline-flex; align-items:center; gap:4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Test call</span>` : ''}
      </div>
    </div>`;
}

function renderCatalogGrid(agents){
  const grid = document.getElementById('catalogGrid');
  const empty = document.getElementById('catalogEmpty');
  catalogAgentsById = {};
  agents.forEach(a => { catalogAgentsById[a.id] = a; });
  if (!agents.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  grid.innerHTML = agents.map(renderAgentCard).join('');
  grid.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => openAgentModal(card.dataset.agentId));
  });
}

function renderCatalogFilters(){
  const container = document.getElementById('catalogFilters');
  // Drop any selection that the new scope can't satisfy (e.g. Stage =
  // "Bucket 2" after switching to a Sales service) instead of silently
  // filtering to zero results behind a dropdown that no longer shows it.
  FILTER_KEYS.forEach(key => {
    if (catalogFilterState[key] && !filterOptions(key).includes(catalogFilterState[key])) catalogFilterState[key] = '';
  });
  container.innerHTML = FILTER_KEYS.map(key => {
    const options = filterOptions(key);
    if (!options.length) return ''; // e.g. Stage for Sales services — no agent has one
    const optHtml = options.map(o => `<option value="${o}" ${catalogFilterState[key] === o ? 'selected' : ''}>${o}</option>`).join('');
    return `<select class="catalog-filter-select" data-filter-key="${key}">
      <option value="">${FILTER_LABELS[key]}: All</option>
      ${optHtml}
    </select>`;
  }).join('');
  container.querySelectorAll('.catalog-filter-select').forEach(sel => {
    sel.addEventListener('change', () => {
      catalogFilterState[sel.dataset.filterKey] = sel.value;
      runCatalogSearch();
    });
  });
}

function renderCatalogSidebar(){
  const container = document.getElementById('catalogSidebar');
  const services = catalogFacets.services || [];
  const itemsHtml = services.map(s => {
    const active = catalogFilterState.service === s ? 'active' : '';
    return `<button class="catalog-nav-item ${active}" data-service="${s}">${s}</button>`;
  }).join('');
  const allActive = catalogFilterState.service === '' ? 'active' : '';
  container.innerHTML = `
    <div class="catalog-nav-group">
      <button class="catalog-nav-item ${allActive}" data-service="">All agents</button>
      ${itemsHtml}
    </div>`;
  container.querySelectorAll('.catalog-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      catalogFilterState.service = btn.dataset.service;
      container.querySelectorAll('.catalog-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCatalogFilters(); // option lists depend on the selected service
      runCatalogSearch();
    });
  });
}

async function runCatalogSearch(){
  const query = document.getElementById('catalogSearchInput').value.trim();
  const body = { query, ...catalogFilterState };
  Object.keys(body).forEach(k => { if (!body[k]) delete body[k]; });
  try {
    const res = await fetch('/api/agent-catalog/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    renderCatalogGrid(data.results || []);
    const modeEl = document.getElementById('catalogSearchMode');
    if (query && data.semantic) { modeEl.textContent = 'Semantic match'; modeEl.classList.add('is-semantic'); }
    else if (query) { modeEl.textContent = 'Text match'; modeEl.classList.remove('is-semantic'); }
    else { modeEl.textContent = ''; modeEl.classList.remove('is-semantic'); }
  } catch (e) {
    console.error('[agentCatalog] search failed', e);
  }
}

async function loadAgentCatalog(){
  if (catalogLoaded) return;
  catalogLoaded = true;
  try {
    const res = await fetch('/api/agent-catalog');
    const data = await res.json();
    catalogFacets = data.facets;
    catalogAllAgents = data.agents || [];
    renderCatalogSidebar();
    renderCatalogFilters();
    renderCatalogGrid(data.agents || []);
  } catch (e) {
    console.error('[agentCatalog] failed to load catalog', e);
    document.getElementById('catalogEmpty').textContent = 'Could not load the agent catalog.';
    document.getElementById('catalogEmpty').style.display = 'block';
  }
}

// Detail modal — opened on card click. Version History / Tune Parameters /
// Clone are demo-only mock panels (no backend, nothing persisted): this is a
// catalog of 140 mostly-placeholder agents, so there's no real version or
// tuning data to show — the panels demonstrate what the real product surface
// would look like without pretending to be wired to anything live.
const VERSION_HISTORY_TEMPLATE = [
  { version: 'v3.2', tag: 'Current', note: 'Retrained on the last 30 days of call transcripts, improved tone calibration.' },
  { version: 'v3.1', tag: '', note: 'Added regional-language code-switching mid-call.' },
  { version: 'v3.0', tag: '', note: 'Initial production release.' },
];

function seedFromString(str){
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function renderAgentModalBody(agent){
  const rating = agent.rating != null ? `${agent.rating.toFixed(1)} rating` : 'Unrated';
  return `
    <div class="agent-modal-head">
      <div class="agent-avatar agent-avatar-lg">${initialsFor(agent.name)}</div>
      <div style="flex:1">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div class="agent-modal-name">${agent.name}</div>
          ${clientBadge(agent)}
        </div>
        <div class="agent-modal-usecase">${agent.service}</div>
      </div>
    </div>
    ${bestBadge(agent) ? `<div style="margin-bottom:10px">${bestBadge(agent)}</div>` : ''}
    <p class="agent-modal-persona">${agent.description}</p>
    ${agentChipRows(agent)}
    <div class="agent-modal-stats">
      <span>${agent.personaTone} tone</span>
      <span>${rating}</span>
      <span>${formatMinutes(agent.minutesSpoken)}</span>
    </div>

    <div class="agent-modal-actions">
      <button class="catalog-filter-select agent-modal-action" data-panel="call">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Test call
      </button>
      <button class="catalog-filter-select agent-modal-action" data-panel="history">Version history</button>
      <button class="catalog-filter-select agent-modal-action" data-panel="tune">Tune parameters</button>
      <button class="catalog-filter-select agent-modal-action" data-panel="performance">Performance</button>
      <button class="catalog-filter-select agent-modal-action" data-panel="clone">Clone</button>
    </div>
    <div class="agent-modal-panel" id="agentModalPanel"></div>`;
}

// Insights this kind of agent captures about the people it talks to. Which
// signals apply depends on the line: a collections agent learns why someone
// missed a payment and how they'll respond, a sales agent learns interest,
// spend and objections. The VALUES are seeded sample figures (same agent ->
// same numbers every open), like the rest of this modal's mock panels —
// what's real here is the choice of signals, not the percentages.
function seededRand(seed){
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function shuffled(rand, list){
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// n percentages that sum to 100, largest first.
function splitPercents(rand, n){
  const w = Array.from({ length: n }, () => 0.4 + rand());
  const total = w.reduce((x, y) => x + y, 0);
  const p = w.map(x => Math.round(x / total * 100));
  p[0] += 100 - p.reduce((x, y) => x + y, 0);
  return p.sort((x, y) => y - x);
}
function topShares(rand, labels, take){
  const order = shuffled(rand, labels);
  const pct = splitPercents(rand, labels.length);
  return order.slice(0, take).map((l, i) => `${l} ${pct[i]}%`).join(' · ');
}
const between = (rand, lo, hi) => Math.round(lo + rand() * (hi - lo));

function insightsFor(agent, seed){
  const r = seededRand(seed ^ 0x9e3779b9);
  if (agent.line === 'Sales') {
    const interest = splitPercents(r, 3);
    const products = agent.products || [];
    const productSplit = products.length > 1
      ? (() => { const a = between(r, 52, 72); return `${products[0]} ${a}% · ${products[1]} ${100 - a}%`; })()
      : `${products[0] || 'Credit Cards'} 100%`;
    const sal = between(r, 58, 82);
    return [
      { label: 'Interest level', desc: 'How warm the prospect is after the pitch', value: `Hot ${interest[0]}% · Warm ${interest[1]}% · Cold ${interest[2]}%` },
      { label: 'Product interest', desc: 'Which product the prospect leaned towards', value: productSplit },
      { label: 'Spend profile', desc: 'Where they say they spend most each month', value: topShares(r, ['Bills & utilities', 'Travel', 'Shopping', 'Dining', 'Fuel'], 3) },
      { label: 'Employment & income', desc: 'Self-declared on the call, used to pre-screen eligibility', value: `Salaried ${sal}% · Self-employed ${100 - sal}%` },
      { label: 'Top objections', desc: 'What stopped them saying yes', value: topShares(r, ['Annual fee', 'Already has a card', 'Not interested now', 'Wants to compare offers'], 3) },
      { label: 'Callback window & consent', desc: 'When to follow up, and whether they agreed to be contacted', value: `${pickOne(r, ['10 AM–12 PM', '12–2 PM', '4–6 PM', '6–8 PM'])} · consent ${between(r, 84, 96)}%` },
    ];
  }
  const sent = splitPercents(r, 3);
  return [
    { label: 'Promise-to-pay rate', desc: 'Answered calls that end in a dated payment commitment', value: `${between(r, 28, 58)}%` },
    { label: 'Right-party contact', desc: 'Calls that reach the borrower, not a relative or wrong number', value: `${between(r, 52, 82)}%` },
    { label: 'Reasons for delay', desc: 'Why the payment was missed, in the borrower’s own words', value: topShares(r, ['Salary delayed', 'Medical expense', 'Forgot / oversight', 'Disputes the charge', 'Business slowdown', 'Job loss'], 3) },
    { label: 'Sentiment', desc: 'Tone of the borrower across the call', value: `Cooperative ${sent[0]}% · Neutral ${sent[1]}% · Resistant ${sent[2]}%` },
    { label: 'Best time to reach', desc: 'Window and channel the borrower actually responds on', value: `${pickOne(r, ['9–11 AM', '12–2 PM', '4–6 PM', '6–8 PM'])} · ${pickOne(r, ['Call', 'WhatsApp'])}` },
    { label: 'Dispute & escalation flags', desc: 'Calls flagged for a dispute, complaint or human hand-off', value: `${between(r, 3, 12)}%` },
  ];
}
function pickOne(rand, list){ return list[Math.floor(rand() * list.length)]; }

function renderModalPanel(kind, agent, seed){
  const panel = document.getElementById('agentModalPanel');
  if (kind === 'call') {
    const isLiveSarvam = !!agent.appId;
    panel.innerHTML = `
      <div class="modal-panel-call">
        <div class="modal-call-header">
          <div>
            <strong>Direct test call with ${agent.name}</strong>
            <div class="modal-call-meta">
              ${isLiveSarvam ? `Connected to Sarvam App: <code>${agent.appId}</code> (v${agent.appVersion || 1})` : `Dispatches via ${agent.provider || 'default provider'}`}
            </div>
          </div>
          ${agent.badge ? `<span class="agent-badge-client"><span class="badge-dot"></span>${agent.badge}</span>` : ''}
        </div>

        <div style="margin-top:14px; display:flex; flex-direction:column; gap:10px;">
          <div>
            <label style="display:block; font-size:11.5px; color:var(--text-faint); margin-bottom:4px;">Customer / Prospect Name</label>
            <input type="text" id="agentCallName" class="catalog-filter-select" style="width:100%; box-sizing:border-box; height:36px; padding:0 12px; font-size:13px;" placeholder="Name (e.g. Rahul Sharma)" value="${window.capturedName || ''}">
          </div>
          <div>
            <label style="display:block; font-size:11.5px; color:var(--text-faint); margin-bottom:4px;">Phone Number (E.164 or 10 digits)</label>
            <input type="tel" id="agentCallPhone" class="catalog-filter-select" style="width:100%; box-sizing:border-box; height:36px; padding:0 12px; font-size:13px;" placeholder="+91 98765 43210" value="${window.capturedPhone || ''}">
          </div>
          <button class="btn-pill-primary" id="btnAgentCallSubmit" style="width:100%; height:38px; margin-top:6px; font-size:13px; font-weight:600; cursor:pointer;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:6px;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Place test call with ${agent.name}
          </button>
          <div id="agentCallStatus" style="font-size:12px; margin-top:6px; min-height:18px; text-align:center;"></div>
        </div>
      </div>`;

    const nameIn = document.getElementById('agentCallName');
    const phoneIn = document.getElementById('agentCallPhone');
    const submitBtn = document.getElementById('btnAgentCallSubmit');
    const statusEl = document.getElementById('agentCallStatus');

    submitBtn.addEventListener('click', async () => {
      const name = nameIn.value.trim() || 'Valued Customer';
      const phone = phoneIn.value.trim();
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        statusEl.innerHTML = '<span style="color:var(--red);">Please enter a valid 10-digit phone number</span>';
        return;
      }
      submitBtn.disabled = true;
      statusEl.innerHTML = `<span style="color:var(--blue);">Dialing ${agent.name}... connecting to Sarvam API</span>`;

      try {
        const res = await fetch('/api/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            useCase: agent.line === 'Sales' ? 'sales' : 'collections',
            agentId: agent.id,
            sarvamAppId: agent.appId || undefined,
            sarvamAppVersion: agent.appVersion || undefined,
          }),
        });
        const data = await res.json();
        if (res.ok && data.call_id) {
          statusEl.innerHTML = `<span style="color:var(--green);">✓ Call initiated! Attempt ID: <code>${data.call_id}</code>. Your phone should ring shortly.</span>`;
        } else {
          statusEl.innerHTML = `<span style="color:var(--red);">${data.error || 'Dispatch failed'}${data.detail ? ` (${JSON.stringify(data.detail)})` : ''}</span>`;
          submitBtn.disabled = false;
        }
      } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--red);">Network error: ${err.message}</span>`;
        submitBtn.disabled = false;
      }
    });
    return;
  }
  if (kind === 'performance') {
    const p = agent.performance || {};
    const insights = insightsFor(agent, seed);
    panel.innerHTML = `
      <div class="perf-grid">
        <div class="perf-tile"><div class="perf-value">${p.latencyMs}<small>ms</small></div><div class="perf-label">Avg response latency</div></div>
        <div class="perf-tile"><div class="perf-value">${p.wordsPerMin}<small>wpm</small></div><div class="perf-label">Word rate</div></div>
        <div class="perf-tile perf-tile-qc"><div class="perf-value">${p.qcScore.toFixed(1)}<small>/100</small></div><div class="perf-label">QC audit score</div></div>
      </div>
      <div class="insights-head">Insights captured about customers</div>
      <div class="insight-list">${insights.map(i => `
        <div class="insight-row">
          <div class="insight-main"><div class="l">${i.label}</div><div class="d">${i.desc}</div></div>
          <div class="insight-val">${i.value}</div>
        </div>`).join('')}</div>`;
    return;
  }
  if (kind === 'history') {
    const list = (agent.appVersion || agent.appId) ? [
      { version: `v${agent.appVersion || 3}.0`, tag: 'Active Deployment', note: `Deployed on Sarvam Samvaad (App: ${agent.appId || 'Predixion-A-0127b3d3-b7da'}), optimized for ${agent.client || 'mPokket'} ${agent.line === 'Collections' ? 'collections' : 'cold-sales'} outreach.` },
      ...(agent.appVersion > 1 ? [
        { version: 'v2.0', tag: '', note: agent.line === 'Collections' ? 'Payment-date negotiation and callback scheduling tuned for overdue EMIs.' : 'Objection handling and callback scheduling tuned for instant personal loans.' },
        { version: 'v1.0', tag: '', note: 'Initial production release.' },
      ] : []),
    ] : VERSION_HISTORY_TEMPLATE;
    panel.innerHTML = `<div class="modal-panel-list">${list.map(v => `
      <div class="modal-panel-row">
        <div class="modal-panel-row-top"><strong>${v.version}</strong>${v.tag ? `<span class="modal-panel-tag">${v.tag}</span>` : ''}</div>
        <div class="modal-panel-row-note">${v.note}</div>
      </div>`).join('')}</div>`;
    return;
  }
  if (kind === 'tune') {
    const params = [
      { key: 'empathy', label: 'Empathetic ↔ Firm', value: 20 + (seed % 60) },
      { key: 'pace', label: 'Speaking pace', value: 30 + ((seed >> 3) % 50) },
      { key: 'escalation', label: 'Escalation threshold', value: 10 + ((seed >> 6) % 70) },
    ];
    panel.innerHTML = `<div class="modal-panel-tune">
      ${params.map(p => `
        <label class="modal-tune-row">
          <span>${p.label}</span>
          <input type="range" min="0" max="100" value="${p.value}" data-tune-key="${p.key}">
        </label>`).join('')}
      <button class="btn-pill-primary modal-tune-save" id="agentModalTuneSave">Save changes</button>
      <div class="modal-tune-note" id="agentModalTuneNote"></div>
    </div>`;
    document.getElementById('agentModalTuneSave').addEventListener('click', () => {
      document.getElementById('agentModalTuneNote').textContent = 'Parameters updated for this session (demo only — not persisted).';
    });
    return;
  }
  if (kind === 'clone') {
    panel.innerHTML = `<div class="modal-panel-clone">
      <p>Create an editable copy of <strong>${agent.name}</strong> to customize without affecting the live agent.</p>
      <button class="btn-pill-primary" id="agentModalCloneBtn">Clone this agent</button>
      <div class="modal-tune-note" id="agentModalCloneNote"></div>
    </div>`;
    document.getElementById('agentModalCloneBtn').addEventListener('click', (e) => {
      const cloneId = `${agent.id}-copy-${(seed % 9000 + 1000)}`;
      document.getElementById('agentModalCloneNote').textContent = `Cloned as "${agent.name} Copy" • Draft • ${cloneId}`;
      e.target.disabled = true;
    });
  }
}

function openAgentModal(agentId){
  const agent = catalogAgentsById[agentId];
  if (!agent) return;
  document.getElementById('agentModalBody').innerHTML = renderAgentModalBody(agent);
  document.getElementById('agentModalOverlay').style.display = 'flex';
  const seed = seedFromString(agent.id);
  document.querySelectorAll('.agent-modal-action').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.agent-modal-action').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderModalPanel(btn.dataset.panel, agent, seed);
    });
  });
  // Default open panel — open "Test call" immediately for live agents with an appId (e.g. Priya),
  // otherwise default to "Version history".
  const defaultPanel = (agent.appId || agent.id === 'mpokket-priya') ? 'call' : 'history';
  const defaultBtn = document.querySelector(`.agent-modal-action[data-panel="${defaultPanel}"]`) || document.querySelector('.agent-modal-action[data-panel="history"]');
  if (defaultBtn) defaultBtn.click();
}

function closeAgentModal(){
  document.getElementById('agentModalOverlay').style.display = 'none';
}

document.getElementById('agentModalClose').addEventListener('click', closeAgentModal);
document.getElementById('agentModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'agentModalOverlay') closeAgentModal();
});

function enterAgentCatalog(){
  if (window.track) track('agent_catalog_open', {});
  loadAgentCatalog();
  goTo('screen-agent-catalog');
}

document.getElementById('navPlatform').addEventListener('click', (e) => {
  e.preventDefault();
  enterAgentCatalog();
});
document.getElementById('btnCatalogBack').addEventListener('click', () => goTo('screen-landing'));
document.getElementById('catalogSearchInput').addEventListener('input', () => {
  clearTimeout(catalogSearchTimer);
  catalogSearchTimer = setTimeout(runCatalogSearch, 350);
});
