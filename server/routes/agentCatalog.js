const express = require('express');
const agentCatalogIndex = require('../lib/agentCatalogIndex');
const agentVersions = require('../lib/agentVersions');
const catalogAgent = (appId) => agentCatalogIndex.getAllAgents().find((a) => a.appId && a.appId === appId);

const router = express.Router();

// Full listing + filter facets — used to render the catalog grid and build
// the filter dropdowns before any search has happened.
router.get('/agent-catalog', (req, res) => {
  res.json({
    agents: agentCatalogIndex.getAllAgents(),
    facets: agentCatalogIndex.getFacets(),
  });
});

// Real semantic search (Gemini embeddings, see embeddingsClient.js) plus
// exact metadata filters. Body: { query, service, product, stage, objective,
// language, persona } — all optional; an empty body returns the unranked,
// unfiltered catalog.
router.post('/agent-catalog/search', async (req, res) => {
  const { query, service, product, stage, objective, language, persona } = req.body || {};
  try {
    const result = await agentCatalogIndex.search({ query, service, product, stage, objective, language, persona });
    res.json(result);
  } catch (err) {
    console.error('[agentCatalog] search error', err);
    res.status(502).json({ error: 'search_failed', detail: String(err) });
  }
});

// Which version of a Sarvam agent is used: the newest by default, or a pinned one.
// GET ?appId=…[&refresh=1]   POST { appId, version }  (version null = back to latest)
router.get('/agent-versions', async (req, res) => {
  const a = catalogAgent(req.query.appId);
  if (!a) return res.status(404).json({ error: 'Unknown agent' });
  res.json(await agentVersions.resolve(a.appId, a.appVersion, { refresh: req.query.refresh === '1' }));
});

router.post('/agent-versions', async (req, res) => {
  const { appId, version } = req.body || {};
  const a = catalogAgent(appId);
  if (!a) return res.status(404).json({ error: 'Unknown agent' });
  const r = await agentVersions.setPin(a.appId, version === null || version === '' || version === undefined ? null : version);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(await agentVersions.resolve(a.appId, a.appVersion));
});

module.exports = router;
