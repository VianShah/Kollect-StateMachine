const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const embeddingsClient = require('./embeddingsClient');
const agentUsage = require('./agentUsage');

const CATALOG_PATH = path.join(__dirname, '..', 'agentCatalog.json');
const CACHE_PATH = path.join(__dirname, '..', 'data', 'agentCatalogEmbeddings.json');

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));

// The four services the library covers, and the delinquency stages, in the
// order they should display (a sorted Set would put "Bucket 1" before
// "Pre-due"). Anything not listed here can't appear in the sidebar/filters.
const SERVICES = ['Retail debt collections', 'Business debt collections', 'Cross-selling', 'Cold sales'];
const STAGES = ['Pre-due', 'Bucket X', 'Bucket 1', 'Bucket 2', 'Bucket 3'];

// One combined string per agent is what actually gets embedded — service,
// products, stage, objective, tone, languages and description all feed the
// same vector so a query like "firm agent for credit card settlements" can
// match on meaning across any of those fields, not just an exact keyword in
// one of them.
function searchTextFor(agent) {
  return [agent.name, agent.service, (agent.products || []).join(', '), agent.stage, agent.objective,
    agent.personaTone, (agent.languages || []).join(', '), agent.description,
    agent.badge, agent.client,
    agent.bestRegion ? `best performer in ${agent.bestRegion}` : '']
    .filter(Boolean).join(' — ');
}

// Cheap content hash so a changed catalog invalidates the cache instead of
// silently searching against stale embeddings for entries that no longer
// exist (or serving wrong vectors for edited personas).
function catalogHash() {
  return crypto.createHash('sha1').update(JSON.stringify(catalog)).digest('hex');
}

let vectors = null; // number[][], same order/length as catalog
let ready = false;
let readyError = null;

async function buildIndex() {
  const hash = catalogHash();
  if (fs.existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (cached.hash === hash && Array.isArray(cached.vectors) && cached.vectors.length === catalog.length) {
        vectors = cached.vectors;
        ready = true;
        console.log(`[agentCatalogIndex] loaded ${vectors.length} cached embeddings`);
        return;
      }
    } catch (e) { /* fall through to recompute */ }
  }

  try {
    console.log(`[agentCatalogIndex] computing embeddings for ${catalog.length} agents (no valid cache found)...`);
    vectors = await embeddingsClient.embedTexts(catalog.map(searchTextFor));
    ready = true;
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ hash, vectors }));
    console.log(`[agentCatalogIndex] embeddings ready and cached`);
  } catch (err) {
    readyError = err.message || String(err);
    console.error('[agentCatalogIndex] failed to build embeddings — semantic search will report unavailable:', readyError);
  }
}

// Fire-and-forget at module load — GET /api/agent-catalog (metadata-only
// listing) works immediately regardless; only the semantic search endpoint
// needs this to have finished.
const indexPromise = buildIndex();

// Live (Sarvam) agents carry their real tracked talk time; every other agent
// is unchanged and keeps its seeded minutesSpoken.
function withUsage(agent) {
  if (!agent.appId) return agent;
  const u = agentUsage.get(agent.appId);
  return { ...agent, talkSeconds: u.seconds, callsPlaced: u.calls };
}

function getAllAgents() {
  return catalog.map(withUsage);
}

// Facet lists come from the data (so they can never offer an option no
// agent has), but services and stages keep their fixed display order.
function getFacets() {
  const present = new Set(catalog.map(a => a.service));
  const presentStages = new Set(catalog.map(a => a.stage).filter(Boolean));
  const uniqueSorted = (list) => [...new Set(list)].sort();
  return {
    services: SERVICES.filter(s => present.has(s)),
    products: uniqueSorted(catalog.flatMap(a => a.products || [])),
    stages: STAGES.filter(s => presentStages.has(s)),
    objectives: uniqueSorted(catalog.map(a => a.objective)),
    languages: uniqueSorted(catalog.flatMap(a => a.languages || [])),
    personas: uniqueSorted(catalog.map(a => a.personaTone)),
  };
}

// Combines real semantic similarity (when a query is given and the index is
// ready) with exact metadata filters (service/product/stage/objective/
// language/persona) — filters narrow the candidate set first, then
// similarity ranks what's left. product and language match when ANY of the
// agent's values equals the filter. With no query, filtered results are
// returned in catalog order (no meaningless "similarity" score to sort by).
async function search({ query, service, product, stage, objective, language, persona } = {}) {
  let candidates = catalog.map((agent, i) => ({ agent, index: i }));

  if (service) candidates = candidates.filter(c => c.agent.service === service);
  if (product) candidates = candidates.filter(c => (c.agent.products || []).includes(product));
  if (stage) candidates = candidates.filter(c => c.agent.stage === stage);
  if (objective) candidates = candidates.filter(c => c.agent.objective === objective);
  if (language) candidates = candidates.filter(c => (c.agent.languages || []).includes(language));
  if (persona) candidates = candidates.filter(c => c.agent.personaTone === persona);

  const trimmedQuery = (query || '').trim();
  if (!trimmedQuery) {
    return { results: candidates.map(c => ({ ...withUsage(c.agent), score: null })), semantic: false };
  }

  await indexPromise;
  if (!ready) {
    // Degrade to plain substring matching rather than returning nothing —
    // still useful, just not "semantic". Callers can check `semantic` to
    // know which mode actually ran.
    const q = trimmedQuery.toLowerCase();
    const filtered = candidates.filter(c => searchTextFor(c.agent).toLowerCase().includes(q));
    return { results: filtered.map(c => ({ ...withUsage(c.agent), score: null })), semantic: false, reason: readyError || 'index_not_ready' };
  }

  const queryVector = await embeddingsClient.embedText(trimmedQuery);
  const scored = candidates.map(c => ({
    ...withUsage(c.agent),
    score: embeddingsClient.cosineSimilarity(queryVector, vectors[c.index]),
  }));
  scored.sort((a, b) => b.score - a.score);
  return { results: scored, semantic: true };
}

module.exports = { getAllAgents, getFacets, search };
