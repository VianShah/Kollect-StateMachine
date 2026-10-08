// Demo picker landing screen — precedes the Kollect capture flow. Kollect is
// the one live demo; AgentX has no destination yet, LeadX links out to its
// own standalone deployment (set by the user, not part of this app).
const LEADX_URL = 'https://leadx-predixion-ai.netlify.app/';

function enterKollectDemo(){
  if (window.track) track('landing_start_demo', {});
  goTo('screen-capture');
}

document.getElementById('btnLandingStartKollect').addEventListener('click', enterKollectDemo);
// Whole-card tap, not just the pill inside it — a bigger, more forgiving
// touch target at a booth kiosk, and the same affordance LeadX's card
// already has (see below). Guard against the button's own click bubbling
// up and firing this a second time.
document.getElementById('cardKollect').addEventListener('click', (e) => {
  if(e.target.closest('#btnLandingStartKollect')) return;
  enterKollectDemo();
});

// The "Open LeadX" pill is a real <a target="_blank">, so its own click
// needs no JS — that's also what makes it work as a native link (middle-click,
// long-press, right-click "open in new tab") instead of only a plain click.
// The card-level listener below is just a bigger, more forgiving hit target
// at a booth kiosk; clicking the link itself must not also trigger this one.
document.getElementById('cardLeadX').addEventListener('click', (e) => {
  if(e.target.closest('#btnLandingOpenLeadX')) return;
  if (window.track) track('landing_leadx_click', {});
  window.open(LEADX_URL, '_blank', 'noopener');
});

// Direct call trigger (2026-09-26 user request) — a quick name+phone form
// on the landing screen itself, bypassing the whole capture/orb/archetype
// flow, for placing a real call straight away. Reuses the same POST /api/call
// the rest of the app already uses, which tries Sarvam FIRST automatically
// (server/routes/call.js) — no separate endpoint needed, and it inherits the
// same safe fallback (Enhanced Quality, then VOIZ) if Sarvam isn't
// configured or its dispatch fails, same as everywhere else in the app.
(function () {
  const toggleBtn   = document.getElementById('btnDirectCallToggle');
  const fabBtn      = document.getElementById('btnDirectCallFab');
  const overlay     = document.getElementById('directCallOverlay');
  const closeBtn    = document.getElementById('btnDirectCallClose');
  const nameInput   = document.getElementById('dcallName');
  const phoneInput  = document.getElementById('dcallPhone');
  const usecaseBtns = document.querySelectorAll('.direct-call-usecase-btn');
  const submitBtn   = document.getElementById('btnDcallSubmit');
  const statusEl    = document.getElementById('dcallStatus');
  if (!toggleBtn || !overlay) return;

  // Which agent this call goes to (2026-09-30 user request) — defaults to
  // Collections every time the panel opens, matching the main app's own
  // default (state.js). Sales has no VOIZ/ElevenLabs fallback server-side
  // (server/routes/call.js) — a failed Sales dispatch surfaces as a plain
  // error here, same as everywhere else.
  let dcallUsecase = 'collections';

  usecaseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dcallUsecase = btn.dataset.usecase;
      usecaseBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  function openOverlay(){
    overlay.style.display = 'flex';
    dcallUsecase = 'collections';
    usecaseBtns.forEach(b => b.classList.toggle('active', b.dataset.usecase === 'collections'));
    // Focus after the transition frame, not synchronously — mobile
    // Safari can ignore a focus() call issued before the element has
    // actually been painted visible.
    requestAnimationFrame(() => nameInput.focus());
  }
  function closeOverlay(){ overlay.style.display = 'none'; }

  toggleBtn.addEventListener('click', openOverlay);
  fabBtn.addEventListener('click', openOverlay);
  closeBtn.addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

  submitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    if (!name || phone.length < 7) {
      statusEl.textContent = 'Enter a name and a valid phone number.';
      statusEl.className = 'direct-call-status is-error';
      return;
    }
    submitBtn.disabled = true;
    statusEl.textContent = 'Calling…';
    statusEl.className = 'direct-call-status';
    if (window.track) track('landing_direct_call_triggered', { name, phone, useCase: dcallUsecase });
    try {
      const callBody = {
        name, phone,
        voiceId: 'priya', lang: 'hi',
        archetypeId: 'technical', overdueDays: 12,
        useCase: dcallUsecase,
      };
      const postCall = (extra) => fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...callBody, ...extra }),
      });
      let res = await postCall({});
      let data = await res.json();
      // Server answers 409 rather than silently dialing the backup agent
      // when the primary one couldn't place the call — ask first.
      if (res.status === 409 && data.needsFallbackConfirm) {
        if (window.confirm('The primary voice agent could not place this call. Place it through the backup agent instead? It uses a different voice and script.')) {
          statusEl.textContent = 'Calling via backup…';
          res = await postCall({ allowFallback: true });
          data = await res.json();
        } else {
          statusEl.textContent = 'Call not placed.';
          statusEl.className = 'direct-call-status is-error';
          return;
        }
      }
      if (res.ok && data.call_id) {
        // Which real provider (Sarvam/ElevenLabs/VOIZ) actually dispatched
        // the call is an internal implementation detail — never surfaced
        // to whoever's using this form (2026-09-30 user request).
        statusEl.textContent = 'Call placed.';
        statusEl.className = 'direct-call-status is-ok';
      } else {
        statusEl.textContent = data.error || 'Could not place the call.';
        statusEl.className = 'direct-call-status is-error';
      }
    } catch (e) {
      statusEl.textContent = 'Network error — could not reach the server.';
      statusEl.className = 'direct-call-status is-error';
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
