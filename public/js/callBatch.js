// Single / Batch call bubble, shared by every call trigger (landing direct
// call, Agent Library test call, dashboard direct dispatch).
//
// CallBatch.attach(nameInput, phoneInput) puts a "Single call | Batch call"
// toggle above the existing name+phone fields. In Batch mode the existing
// fields become person 1 and an extra block appears below them with a "+"
// to add up to MAX_PEOPLE people in total. The form's own submit handler
// stays in charge: it asks the controller for entries() and, in batch mode,
// hands them to CallBatch.run().
(function () {
  const MAX_PEOPLE = 5;
  const STAGGER_MS = 400; // spreads dispatches out so Sarvam's API isn't hit all at once

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // anchors: { toggleBefore, extrasAfter } override where the pieces go when
  // the inputs aren't simple stacked fields (e.g. inside a grid).
  function attach(nameInput, phoneInput, anchors) {
    anchors = anchors || {};
    const toggleBefore = anchors.toggleBefore || nameInput.parentElement;
    const extrasAfter = anchors.extrasAfter || phoneInput.parentElement;
    const fieldWrapClass = phoneInput.parentElement.className;
    const nameCls = nameInput.className, nameStyle = nameInput.style.cssText;
    const phoneCls = phoneInput.className, phoneStyle = phoneInput.style.cssText;

    let batch = false;
    const extras = []; // [{ name: input, phone: input, row: element }]

    // ---- the bubble ----
    const bar = el('div', 'callmode');
    bar.setAttribute('role', 'radiogroup');
    bar.setAttribute('aria-label', 'Call type');
    const btnSingle = el('button', 'callmode-btn active', 'Single call');
    const btnBatch = el('button', 'callmode-btn', 'Batch call');
    [btnSingle, btnBatch].forEach(b => { b.type = 'button'; b.setAttribute('role', 'radio'); });
    btnSingle.setAttribute('aria-checked', 'true');
    btnBatch.setAttribute('aria-checked', 'false');
    bar.append(btnSingle, btnBatch);
    toggleBefore.parentNode.insertBefore(bar, toggleBefore);

    // ---- the extra people block ----
    const block = el('div', 'callbatch');
    block.style.display = 'none';
    const list = el('div', 'callbatch-list');
    const foot = el('div', 'callbatch-foot');
    const addBtn = el('button', 'callbatch-add');
    addBtn.type = 'button';
    const count = el('span', 'callbatch-count');
    foot.append(addBtn, count);
    block.append(list, foot);
    extrasAfter.parentNode.insertBefore(block, extrasAfter.nextSibling);

    function refresh() {
      const total = 1 + extras.length;
      addBtn.textContent = '+ Add person';
      addBtn.disabled = total >= MAX_PEOPLE;
      count.textContent = `${total} of ${MAX_PEOPLE} people`;
      extras.forEach((x, i) => { x.title.textContent = `Person ${i + 2}`; });
    }

    function addRow() {
      if (1 + extras.length >= MAX_PEOPLE) return;
      const row = el('div', 'callbatch-row');
      const head = el('div', 'callbatch-row-head');
      const title = el('span', 'callbatch-row-title');
      const rm = el('button', 'callbatch-remove', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove person');
      head.append(title, rm);

      const nameWrap = el('div', fieldWrapClass);
      const n = document.createElement('input');
      n.type = 'text'; n.placeholder = 'Name'; n.autocomplete = 'off';
      n.className = nameCls; n.style.cssText = nameStyle;
      nameWrap.append(n);

      const phoneWrap = el('div', fieldWrapClass);
      const p = document.createElement('input');
      p.type = 'tel'; p.placeholder = phoneInput.placeholder || '+91 98765 43210'; p.autocomplete = 'off';
      p.setAttribute('inputmode', 'tel');
      p.className = phoneCls; p.style.cssText = phoneStyle;
      phoneWrap.append(p);

      row.append(head, nameWrap, phoneWrap);
      list.append(row);
      const entry = { name: n, phone: p, row, title };
      extras.push(entry);
      rm.addEventListener('click', () => {
        row.remove();
        extras.splice(extras.indexOf(entry), 1);
        refresh();
      });
      refresh();
      n.focus();
    }

    function setMode(isBatch) {
      batch = isBatch;
      btnSingle.classList.toggle('active', !batch);
      btnBatch.classList.toggle('active', batch);
      btnSingle.setAttribute('aria-checked', String(!batch));
      btnBatch.setAttribute('aria-checked', String(batch));
      block.style.display = batch ? 'flex' : 'none';
      if (batch && !extras.length) addRow();
      refresh();
    }

    btnSingle.addEventListener('click', () => setMode(false));
    btnBatch.addEventListener('click', () => setMode(true));
    addBtn.addEventListener('click', addRow);

    return {
      isBatch: () => batch,
      // Person 1 (the form's own fields) plus any extra rows that have
      // something in them. Blank extra rows are ignored.
      entries() {
        const out = [{ name: nameInput.value.trim(), phone: phoneInput.value.trim() }];
        extras.forEach(x => {
          const name = x.name.value.trim(), phone = x.phone.value.trim();
          if (name || phone) out.push({ name, phone });
        });
        return out;
      },
      reset() {
        extras.splice(0).forEach(x => x.row.remove());
        setMode(false);
      },
    };
  }

  const validPhone = (p) => (p || '').replace(/\D/g, '').length >= 7;

  // Returns an error string, or '' if every entry is dialable.
  function validate(entries) {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.name || !validPhone(e.phone)) return `Person ${i + 1}: enter a name and a valid phone number.`;
    }
    const seen = new Set();
    for (const e of entries) {
      const d = e.phone.replace(/\D/g, '').slice(-10);
      if (seen.has(d)) return 'The same number is in the list twice.';
      seen.add(d);
    }
    return '';
  }

  // placeOne(entry) -> Promise<{ ok: boolean, error?: string }>. Dispatches
  // are staggered, then all awaited; one failure never stops the others.
  async function run(entries, placeOne, onProgress) {
    let done = 0;
    const results = await Promise.all(entries.map(async (entry, i) => {
      await new Promise(r => setTimeout(r, i * STAGGER_MS));
      let r;
      try { r = await placeOne(entry); }
      catch (e) { r = { ok: false, error: 'Network error' }; }
      done++;
      if (onProgress) onProgress(done, entries.length);
      return { entry, ...r };
    }));
    const ok = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);
    return { results, ok, failed };
  }

  // One-line summary for a status element.
  function summarize(outcome) {
    const total = outcome.results.length;
    if (!outcome.failed.length) return `All ${total} calls placed.`;
    const why = outcome.failed.map(f => `${f.entry.name} (${f.error || 'failed'})`).join(', ');
    return `${outcome.ok.length} of ${total} placed. Not placed: ${why}`;
  }

  window.CallBatch = { attach, validate, run, summarize, MAX_PEOPLE };
})();
