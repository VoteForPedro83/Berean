# Berean — Translation Licence Architecture

## Three-Tier System — NEVER VIOLATE

### Tier 1 — Offline Core (local SQLite, AI-permitted)
| Translation | Licence | Database | Notes |
|---|---|---|---|
| BSB | CC0 Public Domain | bible_base.sqlite3 | **Best ESV/NIV alternative** — see below |
| WEB | Public domain | bible_base.sqlite3 | |
| KJV | Public domain | bible_base.sqlite3 | |
| ASV | Public domain | bible_base.sqlite3 | |
| ULT | CC BY-SA 4.0 | translations_cc.sqlite3 (SEGREGATED) | unfoldingWord — no AI restriction |
| UST | CC BY-SA 4.0 | translations_cc.sqlite3 (SEGREGATED) | unfoldingWord — no AI restriction |
| SBLGNT | CC BY 4.0 | bible_base.sqlite3 (words table) | |
| Rahlfs LXX | CC BY-NC-SA 4.0 | lxx.sqlite3 (SEGREGATED) | |

### Tier 2 — API.Bible Online Only (no local storage)
| Translation | Status | Notes |
|---|---|---|
| ESV | Pending Crossway agreement | 500 verse/5 000 query-per-day limit; attribution required in UI |
| KJV, ASV, Geneva, LSV | ✅ Live | Public domain — no restrictions |
| TSN (Tswana NT) | ✅ Live | Biblica Open CC BY-SA — AI caution, see below |
| AFR53 | Pending BSSA + API.Bible whitelist | Priority target |
| AFR83 | Pending BSSA + API.Bible whitelist | |
| AFR20 | Unlikely | New text, high commercial resistance from BSSA |
| ZUL59, ZUL20 | Pending BSSA + API.Bible whitelist | City Bible Foundation CZB24 as fallback |
| XHO75, XHO96 | Pending BSSA + API.Bible whitelist | City Bible Foundation CXB24 as fallback |
| NSO51, NSO00 | Pending BSSA + API.Bible whitelist | |
| SSO61, SSO89 | Pending BSSA + API.Bible whitelist | |
| SSW96 | Pending BSSA + API.Bible whitelist | |
| TSO29, TSO91 | Pending BSSA + API.Bible whitelist | |
| TSW70 (full Bible) | Pending BSSA + API.Bible whitelist | TSN NT already live |

### Tier 2 — NIV / ESV special rules
- **NIV EXCLUDED ENTIRELY from AI-enabled builds** — Biblica prohibits NIV in apps with AI features; no exceptions without bespoke licence
- **ESV online only** — Crossway: max 500 verses stored, 5 000 queries/day, attribution must display in UI: *"Scripture quotations are from the ESV® Bible © 2001 by Crossway. Used by permission. All rights reserved."*
- **ESV no offline** — Crossway revoked all offline/SQLite distribution rights in their 2019 policy pivot; AndBible had to remove their ESV module as a result

### Tier 3 — AI Restrictions
- Tier 1 (BSB/WEB/KJV/ASV/ULT/UST): FULL_TEXT — entire text sent to AI ✅
- TSN (Biblica Open): flag for review — CC BY-SA has no AI clause, but Biblica's Express Licence does; treat as REFERENCE_RECALL until Biblica responds to enquiry
- Tier 2 NT (≤3 verses): REFERENCE_RECALL — "John 3:16 (ESV)" + silent WEB anchor
- Tier 2 OT (≤1 verse): REFERENCE_RECALL
- Tier 2 longer passages: WEB_FALLBACK — WEB substituted silently
- NO Tier 2 text ever transmitted as string to AI

---

## The BSB — Critical Addition (CC0, April 2023)

The **Berean Standard Bible (BSB)** was released into the **public domain (CC0)** on 30 April 2023.

- Translated directly from Greek and Hebrew by a dedicated scholarly committee
- Matches ESV and NIV in readability and academic rigour
- **Zero restrictions** — offline storage, AI processing, RAG indexing, vector embeddings, distribution
- Available from: https://bereanbible.com/bsb.txt (plain text) and https://github.com/OpenBibleData/BSB (USFM)
- **This is the primary answer to "how do we get NIV/ESV quality in an AI-enabled app"**

Add BSB to `bible_base.sqlite3` via `build-bible-base.js`. Source: eBible.org or bereanbible.com.

---

## NIV — Legal Pathways Researched

**Standard path is blocked.** Biblica's Express Licence explicitly states the app must not include
"any artificial intelligence or machine learning features or functionality." This is categorical.

**Architectural options assessed by deep research:**

| Option | Legal viability | Verdict |
|---|---|---|
| A — Disable AI when NIV selected | Low — app "includes" AI as a whole entity | ❌ Fails audit |
| B — Show NIV, send WEB to AI silently | Very Low — deceptive; still "includes AI" | ❌ Illegal |
| C — BYOK isolation (no developer server) | Low — developer engineered the AI feature | ❌ Biblica disagrees |
| D — Separate companion app (Berean Reader) | High — legal firewall between text and AI | ✅ Viable but bad UX |
| E — User imports their own licensed NIV | Very High — burden shifts to user (Fair Dealing) | ✅ Best option |

**Recommended approach:** Implement **Option E (BYOT — Bring Your Own Text)**.
The app accepts a user-supplied USFM, SQLite, or SWORD module imported into local IndexedDB.
The app never distributes the NIV. Documentation must not link to or encourage piracy.
Precedent: AndBible, many desktop Bible apps use this exact pattern.

**If negotiating directly:**
- Contact: legal@biblica.com
- Name: Marius Roetz (Senior Director, Rights & Permissions)
- Argue: BYOK architecture = no text reaches developer servers; cite OpenAI's 30-day-only retention API policy

---

## ESV — Legal Pathways Researched

**Online-only via API.Bible is the only viable path** (no offline/SQLite ever).

Crossway revoked open-source offline rights in 2019 (AndBible had to remove their module).
Crossway's API limits: 500 verses/query, 5 000 queries/day, 1 000/hour, 60/minute.
For multi-user app with a single developer key, this exhausts within minutes — each user would
need their own Crossway API key, which is impractical.

Crossway has no explicit AI ban by name, but the 500-verse storage limit de facto prevents RAG
indexing. Piping ESV text to an LLM risks being classified as an unauthorised "commentary,"
which Crossway explicitly prohibits without written permission.

**Recommended approach:** Serve ESV online-only via API.Bible for reading only (no AI context).
Apply REFERENCE_RECALL for ESV passages sent to AI. Display required attribution in the UI.

**If negotiating directly:**
- Contact: rights@crossway.org
- Names: Jaime Suk (Director, Licensing) / Harrison Wiggins (Licensing Representative)

---

## South African Translations

### Copyright situation
ALL modern, readable SA Bible translations are owned by the **Bible Society of South Africa (BSSA)**.
No SA translation is currently in the public domain. Even the 1933 Afrikaans (committee members
died by 1974 → copyright expires end of 2024 theoretically) is legally moot because:
1. The 1953 revision (AFR53) is a new derivative work with its own 50-year term
2. The BSSA updated orthography in subsequent decades, each update resetting the clock
3. Pre-revision texts use archaic orthography illegible to modern readers

### The CrossWire SWORD precedent — use this in every BSSA communication
The BSSA granted CrossWire Bible Society a non-commercial distribution licence for AFR53.
The SWORD module states: *"This copyright Bible has kindly been made available by the Bible
Society of South Africa, strictly for non-commercial use with The SWORD Project."*
The BSSA also previously permitted digitisation of NSO (1951), SSO (1909), TSO (1929),
TSW (1908), and XHO (1975) for mobile apps. This proves institutional willingness.

### The two-step API.Bible path (confirmed by research)
SA translations ARE on API.Bible but locked behind IP-owner approval:
> "Our API can provide access to several other versions, but it's been requested by the
> Intellectual Property Owner that they're contacted first... Upon their approval, we can
> then add to your API key."

**Step 1:** Get written approval from BSSA (copyright@biblesociety.co.za)
**Step 2:** Forward that approval to support@api.bible — they whitelist the translation IDs

### BSSA licence application — what to include
1. App is 100% free, open-source, strictly non-commercial (no ads, no subs, no paywall)
2. Cite the CrossWire SWORD precedent explicitly
3. Explain SQLite security: strict CORS headers + Cloudflare Worker token validation prevents
   bulk download — functionally equivalent to SWORD's compiled DRM module format
4. **Disclose AI features transparently** — BSSA has no public AI ban (unlike Biblica), but
   must negotiate a clause permitting local RAG processing without text alteration or LLM training
5. State preference: online via API.Bible (preferred, lower security risk) vs offline SQLite
6. Target AFR53 first; AFR83 second; do not pursue AFR20 (too new, too commercial)

Contact: **copyright@biblesociety.co.za**

### City Bible Foundation — fallback if BSSA declines
The City Bible Foundation (Netherlands) has published contemporary SA language translations
(2023–2024) and is explicitly open to non-commercial partnerships (100+ licensing deals already).

| Translation | CBF Code | Contact |
|---|---|---|
| Afrikaans 2023 | CAB23 | buy@citybibles.co.za |
| isiZulu 2024 | CZB24 | buy@citybibles.co.za |
| isiXhosa 2024 | CXB24 | buy@citybibles.co.za |
| Sesotho 2024 | CSOB24 | support@biblefactory.org |
| Sepedi 2024 | CSEB24 | support@biblefactory.org |
| Xitsonga 2024 | CTSB24 | support@biblefactory.org |
| Setswana 2024 | CTWB24 | support@biblefactory.org |

These are modern, high-quality, readable translations. Pursue CBF in parallel with BSSA.

### Biblica Open.Bible — AI incompatibility warning
Biblica's Express Licence (which governs Open.Bible texts including TSN Tswana NT) prohibits
use in apps with AI features. The CC BY-SA licence text itself has no such clause, but Biblica
asserts this restriction beyond the CC terms. Until Biblica responds to a direct enquiry
(legal@biblica.com), treat all Biblica Open texts as REFERENCE_RECALL only (no AI context).
Email Biblica about timeline for SA language releases AND ask for AI use exemption.

### ShareAlike Segregation
CC BY-SA data MUST stay in isolated databases. Runtime queries are not "adaptation".
- `morphgnt.sqlite3` — never merge into bible_base.sqlite3
- `translations_cc.sqlite3` — never merge into bible_base.sqlite3
- `lxx.sqlite3` — never merge into bible_base.sqlite3
- `louw_nida` table in lexicon.sqlite3 — isolated, not merged
