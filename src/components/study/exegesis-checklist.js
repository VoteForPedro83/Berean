/* ============================================================
   exegesis-checklist.js — 8-step exegetical checklist
   Right-panel tab: "Exegesis"

   Methodology: Fee/Stuart (How to Read the Bible for All Its Worth)
   + Robinson (Biblical Preaching — the Big Idea method)

   Each step has:
   - Description of what to do
   - User notes textarea (auto-saved to IDB, 1s debounce)
   - "Ask AI" button → streams an AI prompt for that step
   - AI output area (clearable)
   - Completion checkbox

   IDB store: ExegesisChecklists { keyPath: 'osisId' }
   One record per passage, containing all 8 steps' notes + AI output.
   ============================================================ */
import { bus, EVENTS }          from '../../state/eventbus.js';
import { state }                from '../../state/study-mode.js';
import { getChapter }           from '../../db/bible.js';
import { getDB }                from '../../idb/schema.js';
import { streamAiResponse }     from '../../ai/stream.js';
import { buildAiContext, SYSTEM_PROMPT, TRANSLATION_LICENCES } from '../../ai/context.js';
import { getBook }              from '../../data/books.js';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    id:   'text',
    num:  1,
    label: 'Establish the Text',
    desc:  'Identify the passage boundaries. Note any significant textual variants (absent or disputed verses). Which translation best represents the original for this passage?',
    aiPrompt: (ref, ctx) =>
      `For the passage ${ref}, help a pastor establish the text for study.\n\n${ctx}\n\n1. Where does the textual unit begin and end — what are the natural boundaries?\n2. Are there any significant textual variants or disputed verses the pastor should be aware of?\n3. Which English translation most closely reflects the original language for this passage, and why?\n\nKeep it focused and practical.`,
  },
  {
    id:   'situation',
    num:  2,
    label: 'Situational Context',
    desc:  'Who wrote this? To whom, when, and under what circumstances? What problem or question prompted it?',
    aiPrompt: (ref, ctx) =>
      `For ${ref}, provide the situational context a pastor needs for exegesis.\n\n${ctx}\n\n1. Author — identity, background, and relevant circumstances at time of writing\n2. Original recipients — who were they, where, and what was their situation?\n3. Occasion — what prompted this specific passage? Was there a problem, question, or crisis?\n4. Date and historical setting\n\nBe specific. Cite specific historical sources or scholarly consensus where relevant.`,
  },
  {
    id:   'literary',
    num:  3,
    label: 'Literary Context',
    desc:  'What genre is this? How does this passage fit in the argument or narrative of the book? What comes immediately before and after?',
    aiPrompt: (ref, ctx) =>
      `Analyse the literary context of ${ref}.\n\n${ctx}\n\n1. Genre — what type of literature is this (narrative, epistle, prophecy, wisdom, apocalyptic)? How does genre affect interpretation?\n2. Book structure — briefly outline where this passage sits in the book's overall argument or narrative\n3. Immediate context — what does the passage immediately before set up, and what does the passage after resolve?\n4. Any internal literary features — chiasm, parallelism, inclusion, or rhetorical patterns in this unit`,
  },
  {
    id:   'grammar',
    num:  4,
    label: 'Grammatical Analysis',
    desc:  'What are the key terms? Any significant verb tenses, voices, or moods? What do the connecting words (conjunctions, particles) tell us about the flow of argument?',
    aiPrompt: (ref, ctx) =>
      `Provide a grammatical analysis of ${ref} for sermon preparation.\n\n${ctx}\n\n1. Key terms — identify 3-5 words whose precise meaning significantly affects interpretation. Give the original term and Strong's number.\n2. Significant verb forms — any tense, voice, or mood that affects meaning (e.g. present imperative vs aorist, passive voice implying divine agency)\n3. Connecting words — how do conjunctions and particles (therefore, but, so that, because) structure the argument?\n4. Any grammatical ambiguities or disputed constructions\n\nKeep explanations accessible — this is for a pastor, not a linguist.`,
  },
  {
    id:   'biblical',
    num:  5,
    label: 'Biblical Context',
    desc:  'What OT passages does this quote or allude to? Where else in the NT does this theme appear? How does this passage fit the Bible\'s overall story?',
    aiPrompt: (ref, ctx) =>
      `Map the biblical context for ${ref}.\n\n${ctx}\n\n1. OT foundations — any direct quotations, allusions, or typological connections? What OT passage(s) does this build on?\n2. NT cross-references — where do the same themes, terms, or ideas appear elsewhere in the NT?\n3. Redemptive-historical location — where does this passage sit in the Bible's storyline (creation, fall, redemption, new creation)?\n4. Progressive revelation — what does this passage add to what was previously known about this theme?\n\nOnly cite references you are confident exist.`,
  },
  {
    id:   'theology',
    num:  6,
    label: 'Theological Exegesis',
    desc:  'What does this passage teach about God, humanity, sin, salvation, or the Christian life? What is the main theological claim?',
    aiPrompt: (ref, ctx) =>
      `Provide a theological exegesis of ${ref}.\n\n${ctx}\n\n1. What does this passage reveal about God (his character, actions, or purposes)?\n2. What does it teach about humanity — our condition, responsibility, or potential?\n3. What is the passage's central theological claim in one sentence?\n4. How does this contribute to biblical theology? (i.e. how does it advance the Bible's cumulative teaching on this theme)\n5. Note any significant denominational differences in how this passage is interpreted, without endorsing one view.\n\nDistinguish clearly between what the text says and what theologians have inferred from it.`,
  },
  {
    id:   'bridge',
    num:  7,
    label: 'Application Bridge',
    desc:  'What timeless principles does this passage establish? What has changed between the original context and today, and what has not?',
    aiPrompt: (ref, ctx) =>
      `Help a pastor build an application bridge for ${ref}.\n\n${ctx}\n\nFee & Stuart's bridge method:\n1. What was God doing/teaching in the specific historical situation?\n2. What has changed between then and now (covenant, culture, redemptive history)?\n3. What has NOT changed — what is the theological constant that spans both situations?\n4. State 2-3 timeless principles this passage establishes for believers today\n5. What would faithful obedience or application look like in a contemporary congregation?\n\nAvoid moralising or importing 21st-century concerns back into the text. Let the principle emerge from the text's own concern.`,
  },
  {
    id:   'bigidea',
    num:  8,
    label: "Robinson's Big Idea",
    desc:  'Write one complete sentence capturing the central truth of this passage — what it says (subject) and what it says about what it says (complement). This becomes the sermon\'s thesis.',
    aiPrompt: (ref, ctx) =>
      `Help a pastor craft "the Big Idea" of ${ref} using Haddon Robinson's method.\n\n${ctx}\n\nRobinson's Big Idea is a complete, declarative sentence with two parts:\n- **Subject**: What is the passage talking about? (narrow it to one thing)\n- **Complement**: What does the passage say about the subject?\n\nProvide:\n1. The Big Idea sentence (one complete sentence, specific enough to be preachable, broad enough to cover the passage)\n2. A brief explanation of how you derived it from the text\n3. 2-3 alternative phrasings that maintain the same theological content but vary the emphasis\n4. One suggested sermon title that grows from this Big Idea\n\nThe Big Idea should be worded for a contemporary audience, not as an abstract theological proposition.`,
  },
];

// ── IDB helpers ───────────────────────────────────────────────────────────────

async function _loadChecklist(osisId) {
  try {
    const db  = await getDB();
    return await db.get('ExegesisChecklists', osisId) || null;
  } catch { return null; }
}

async function _saveChecklist(record) {
  try {
    const db = await getDB();
    await db.put('ExegesisChecklists', record);
  } catch (e) {
    console.warn('[exegesis] save failed:', e);
  }
}

// ── Module state ──────────────────────────────────────────────────────────────

let _container   = null;
let _passage     = null;
let _record      = null;   // current IDB record
let _saveTimer   = null;
let _aborts      = {};     // { [stepId]: AbortController }

// ── Public init ───────────────────────────────────────────────────────────────

export function initExegesisChecklist(containerEl) {
  _container = containerEl;

  // Seed from current state (lazy-init may have missed earlier events)
  if (state.book && state.chapter) {
    _passage = { book: state.book, chapter: state.chapter, verse: state.verse || 1 };
  }

  _loadAndRender();

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _passage = { book, chapter, verse: state.verse || 1 };
    _abortAll();
    _loadAndRender();
  });

  bus.on(EVENTS.VERSE_SELECT, ({ book, chapter, verse }) => {
    _passage = { book, chapter, verse };
    _abortAll();
    _loadAndRender();
  });

  bus.on(EVENTS.VERSE_RANGE_SELECT, ({ book, chapter, verseStart, verseEnd }) => {
    _passage = { book, chapter, verse: verseStart, verseEnd };
    _abortAll();
    _loadAndRender();
  });
}

// ── Load + render ─────────────────────────────────────────────────────────────

async function _loadAndRender() {
  if (!_container || !_passage) {
    _renderEmpty();
    return;
  }

  const osisKey = _osisKey(_passage);
  _record = await _loadChecklist(osisKey);

  // If no saved record, create an empty skeleton
  if (!_record) {
    _record = {
      osisId:     osisKey,
      passageRef: _passageLabel(_passage),
      updatedAt:  Date.now(),
      steps:      Object.fromEntries(STEPS.map(s => [s.id, { notes: '', aiOutput: '', completed: false }])),
    };
  }

  _render();
}

function _renderEmpty() {
  if (!_container) return;
  _container.innerHTML = `
    <div class="ec">
      <div class="ec__placeholder">
        <p class="ec__placeholder-title">Exegetical Checklist</p>
        <p class="ec__placeholder-body">Navigate to a passage to begin the 8-step exegetical process.</p>
      </div>
    </div>`;
}

function _render() {
  if (!_container || !_record) return;

  const ref      = _record.passageRef;
  const progress = _completedCount();

  _container.innerHTML = `
    <div class="ec">
      <div class="ec__header">
        <h3 class="ec__title">Exegetical Checklist</h3>
        <span class="ec__ref">${_esc(ref)}</span>
        <div class="ec__progress">
          <div class="ec__progress-bar" style="width:${Math.round(progress / STEPS.length * 100)}%"></div>
        </div>
        <span class="ec__progress-label">${progress}/${STEPS.length} steps</span>
      </div>

      ${STEPS.map(s => _renderStep(s)).join('')}

      <footer class="ec__disclaimer">
        AI-generated suggestions — verify all claims against scripture.
      </footer>
    </div>`;

  _wireStepEvents();
}

function _renderStep(step) {
  const data   = _record.steps[step.id];
  const done   = data?.completed ?? false;
  const notes  = data?.notes    ?? '';
  const aiOut  = data?.aiOutput ?? '';

  return `
    <details class="ec__step${done ? ' ec__step--done' : ''}" id="ec-step-${step.id}">
      <summary class="ec__step-header">
        <span class="ec__step-num">${step.num}</span>
        <span class="ec__step-label">${_esc(step.label)}</span>
        <input type="checkbox" class="ec__step-check" data-step="${step.id}"
               ${done ? 'checked' : ''} aria-label="Mark step ${step.num} complete" title="Mark complete">
      </summary>
      <div class="ec__step-body">
        <p class="ec__step-desc">${_esc(step.desc)}</p>
        <textarea class="ec__notes" data-step="${step.id}"
                  placeholder="Your notes…" rows="4">${_esc(notes)}</textarea>
        <div class="ec__ai-controls">
          <button class="ec__ai-btn" data-step="${step.id}" title="Generate AI suggestion for this step">
            \u25B6 Ask AI
          </button>
          ${aiOut ? `<button class="ec__ai-clear" data-step="${step.id}" title="Clear AI output">\u2715 Clear</button>` : ''}
        </div>
        ${aiOut ? `<div class="ec__ai-output" id="ec-ai-${step.id}">${_renderMd(aiOut)}</div>` : `<div class="ec__ai-output" id="ec-ai-${step.id}" hidden></div>`}
      </div>
    </details>`;
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function _wireStepEvents() {
  if (!_container) return;

  // Checkbox — mark step complete
  _container.querySelectorAll('.ec__step-check').forEach(el => {
    el.addEventListener('change', () => {
      const stepId = el.dataset.step;
      if (!_record.steps[stepId]) return;
      _record.steps[stepId].completed = el.checked;

      // Update step wrapper class
      document.getElementById(`ec-step-${stepId}`)
        ?.classList.toggle('ec__step--done', el.checked);

      // Update progress
      const count = _completedCount();
      const pct   = Math.round(count / STEPS.length * 100);
      _container.querySelector('.ec__progress-bar')
        ?.style.setProperty('width', `${pct}%`);
      const lbl = _container.querySelector('.ec__progress-label');
      if (lbl) lbl.textContent = `${count}/${STEPS.length} steps`;

      _scheduleSave();
    });
  });

  // Notes textarea — auto-save
  _container.querySelectorAll('.ec__notes').forEach(el => {
    el.addEventListener('input', () => {
      const stepId = el.dataset.step;
      if (!_record.steps[stepId]) return;
      _record.steps[stepId].notes = el.value;
      _scheduleSave();
    });
  });

  // Ask AI
  _container.querySelectorAll('.ec__ai-btn').forEach(el => {
    el.addEventListener('click', () => _runAiForStep(el.dataset.step));
  });

  // Clear AI output
  _container.querySelectorAll('.ec__ai-clear').forEach(el => {
    el.addEventListener('click', () => {
      const stepId = el.dataset.step;
      if (_record.steps[stepId]) _record.steps[stepId].aiOutput = '';
      const out = document.getElementById(`ec-ai-${stepId}`);
      if (out) { out.innerHTML = ''; out.hidden = true; }
      el.remove();
      _scheduleSave();
    });
  });
}

// ── AI per step ───────────────────────────────────────────────────────────────

async function _runAiForStep(stepId) {
  if (!_passage || !_record) return;

  const stepDef = STEPS.find(s => s.id === stepId);
  if (!stepDef) return;

  // Abort any existing stream for this step
  _aborts[stepId]?.abort();

  const outEl = document.getElementById(`ec-ai-${stepId}`);
  const btn   = _container.querySelector(`.ec__ai-btn[data-step="${stepId}"]`);
  if (!outEl || !btn) return;

  outEl.hidden   = false;
  outEl.innerHTML = '<span class="ec__ai-cursor">\u258B</span>';
  btn.disabled   = true;
  btn.textContent = '\u25A0 Stop';

  // Fetch verses
  const verses = await getChapter(_passage.book, _passage.chapter);
  const verseEnd = _passage.verseEnd ?? _passage.verse;
  const selected = verses.filter(v => v.verse >= _passage.verse && v.verse <= verseEnd);
  const combined = selected.map(v => `[${v.verse}] ${v.text}`).join(' ');

  const passageObj = {
    humanRef:   _passageLabel(_passage),
    osisId:     `${_passage.book}.${_passage.chapter}.${_passage.verse}`,
    verseCount: selected.length,
    text:       combined,
    textWeb:    combined,
    isNT:       getBook(_passage.book)?.testament === 'NT',
    isOT:       getBook(_passage.book)?.testament === 'OT',
    words:      [],
  };

  const { userMessage, basisLabel } = buildAiContext(passageObj, TRANSLATION_LICENCES.WEB);
  const contextBlock = `${userMessage}\n\n${basisLabel}`;
  const userPrompt   = stepDef.aiPrompt(_passageLabel(_passage), contextBlock);

  let full = '';

  const ctrl = streamAiResponse(userPrompt, SYSTEM_PROMPT, {
    provider: 'gemini',
    onChunk: (chunk) => {
      full += chunk;
      outEl.innerHTML = _renderMd(full) + '<span class="ec__ai-cursor">\u258B</span>';
    },
    onDone: (text) => {
      _record.steps[stepId].aiOutput = text;
      outEl.innerHTML = _renderMd(text);
      btn.disabled    = false;
      btn.textContent = '\u21BA Regenerate';
      _scheduleSave();
      // Show clear button if not already there
      if (!_container.querySelector(`.ec__ai-clear[data-step="${stepId}"]`)) {
        const clearBtn = document.createElement('button');
        clearBtn.className   = 'ec__ai-clear';
        clearBtn.dataset.step = stepId;
        clearBtn.title       = 'Clear AI output';
        clearBtn.textContent = '\u2715 Clear';
        clearBtn.addEventListener('click', () => {
          if (_record.steps[stepId]) _record.steps[stepId].aiOutput = '';
          outEl.innerHTML = '';
          outEl.hidden = true;
          clearBtn.remove();
          btn.textContent = '\u25B6 Ask AI';
          _scheduleSave();
        });
        btn.insertAdjacentElement('afterend', clearBtn);
      }
    },
    onError: (err) => {
      outEl.innerHTML = `<p class="ec__ai-error">${_esc(err.message)}</p>`;
      btn.disabled    = false;
      btn.textContent = '\u25B6 Ask AI';
    },
  });

  _aborts[stepId] = ctrl;

  // Stop button
  btn.onclick = () => {
    ctrl.abort();
    outEl.querySelector('.ec__ai-cursor')?.remove();
    btn.disabled    = false;
    btn.textContent = '\u25B6 Ask AI';
    btn.onclick     = null;
    btn.addEventListener('click', () => _runAiForStep(stepId));
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

function _scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (!_record) return;
    _record.updatedAt = Date.now();
    _saveChecklist(_record);
  }, 1000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _abortAll() {
  Object.values(_aborts).forEach(c => c?.abort());
  _aborts = {};
}

function _completedCount() {
  if (!_record?.steps) return 0;
  return STEPS.filter(s => _record.steps[s.id]?.completed).length;
}

function _osisKey(p) {
  return p.verseEnd && p.verseEnd !== p.verse
    ? `${p.book}.${p.chapter}.${p.verse}-${p.verseEnd}`
    : `${p.book}.${p.chapter}.${p.verse}`;
}

function _passageLabel(p) {
  const meta = getBook(p.book);
  const name = meta?.name ?? p.book;
  if (p.verseEnd && p.verseEnd !== p.verse) {
    return `${name} ${p.chapter}:${p.verse}\u2013${p.verseEnd}`;
  }
  return `${name} ${p.chapter}:${p.verse}`;
}

function _renderMd(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 class="ec__h4">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 class="ec__h3">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ec__li">$1</li>')
    .replace(/^[-\u2022]\s+(.+)$/gm, '<li class="ec__li ec__li--bullet">$1</li>')
    .replace(/^---+$/gm, '<hr class="ec__hr"/>')
    .replace(/\n\n+/g, '</p><p class="ec__p">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p class="ec__p">')
    .replace(/$/, '</p>');
}

function _esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
