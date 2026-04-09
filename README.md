# Berean

**Free, offline Bible study and sermon preparation platform for pastors and Bible teachers.**

Berean is built for pastors — especially those in Africa — who need serious Bible study tools without a subscription, an account, or an internet connection. It is permanently free, carries no advertising, and collects no data.

---

## Who it is for

Berean exists to serve pastors and Bible teachers who:
- Preach in languages other than English
- Work in areas with unreliable internet
- Cannot afford commercial Bible software (Logos, Accordance, Faithlife)
- Need to prepare sermons, lead Bible studies, and disciple others

The platform is particularly focused on South Africa, where millions of believers worship in Afrikaans, isiZulu, isiXhosa, Sesotho, Sepedi, Xitsonga, and Setswana — languages that are underserved by existing Bible software.

---

## Features

### Bible Reading
- Multiple translations in parallel columns
- Full-text search across all installed translations
- Offline reading after first load — no internet required
- Cross-references, footnotes, and chapter navigation
- Reading plans with progress tracking
- Reading journal (mark chapters as read, log notes)
- Interlinear Hebrew and Greek with morphology

### Study Tools
- Lexicon (Strong's, BDB, BDAG) with word study panel
- Commentaries and cross-references
- Biblical geography maps (passage-relevant locations)
- Timeline and entity relationship graph
- Exegetical checklist (Fee/Stuart + Robinson methodology)
- Passage context banner (historical period per chapter)
- Topical Bible and word cloud

### Sermon Preparation
- Full-featured sermon editor (TipTap rich text)
- Verse clippings — clip any verse directly into a sermon
- Passage guide (historical context, literary structure, theological themes)
- Illustration library and citation manager
- Preaching calendar with .ics export
- Presentation mode (teleprompter + dual-screen)
- Export to TXT, Markdown, PDF, and offline HTML

### Study Sessions
- Create shareable study packs from sermons
- QR code sharing — works fully offline, no server required
- Participant view optimised for mobile

### Privacy & Sync
- All notes stored locally (IndexedDB — never leaves the device)
- Optional encrypted backup to GitHub Gist or Google Drive
- AI-assisted study using the pastor's own API key — no Bible text passes through any server controlled by the developer

---

## Translation philosophy

Berean is committed to using only licensed or public domain Bible translations. The platform currently includes:

| Translation | Licence | Offline |
|---|---|---|
| Berean Standard Bible (BSB) | CC0 Public Domain | ✅ |
| World English Bible (WEB) | Public Domain | ✅ |
| King James Version (KJV) | Public Domain | ✅ |
| American Standard Version (ASV) | Public Domain | ✅ |
| unfoldingWord Literal Text (ULT) | CC BY-SA 4.0 | ✅ |
| unfoldingWord Simplified Text (UST) | CC BY-SA 4.0 | ✅ |
| SBLGNT Greek New Testament | CC BY 4.0 | ✅ |

We are actively seeking non-commercial distribution licences for South African language translations so that pastors can study and preach in their heart languages. Translation partners are credited prominently in the application interface and in all documentation.

---

## Technical architecture

Berean is a **static web application** — there is no backend server and no database of users.

- Runs entirely in the browser (HTML, CSS, JavaScript)
- Bible text is served as chunked SQLite files via HTTP range requests
- CORS headers and Cloudflare Worker token validation prevent bulk text extraction
- All user data (notes, sermon drafts, API keys) is stored in the browser's IndexedDB — it never leaves the device
- AI features are powered by the user's own API key (Gemini, Groq, or Mistral) — the developer never sees Bible text or user queries
- Service Worker (Workbox) enables full offline operation after first load
- Hosted on Cloudflare Pages (static, no server-side execution)

This architecture means translation text is protected at the same level as a compiled app module — accessible for reading within the app, not extractable in bulk.

---

## Licence

Berean is open-source software licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- Free to use, study, modify, and distribute
- Any modified version must also be released under AGPL-3.0
- Running a modified version as a network service requires releasing the source code
- **No commercial use** — the share-alike terms make commercial exploitation impractical without a separate agreement

See [LICENSE](LICENSE) for the full licence text.

---

## Running locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Node.js 18+ required.

Bible databases are not included in this repository (they are large binary files). Build scripts are in `scripts/`. See the build scripts for source data requirements.

---

## Contributing

Contributions are welcome — bug reports, translations of the UI, accessibility improvements, and new features that serve the mission.

Please open an issue before submitting a large pull request so we can discuss the approach.

---

## Attribution

- **Berean Standard Bible** — bereanbible.com — CC0 Public Domain
- **SBLGNT** — Society of Biblical Literature — CC BY 4.0
- **SR Greek New Testament** — Alan Bunning / Center for New Testament Restoration — CC BY 4.0
- **Strong's Lexicon** — Public Domain
- **BDAG / BDB** — used under academic fair use for non-commercial study
- **Theographic Bible Data** — used for timeline and entity data
- Maps powered by **Leaflet** and **OpenStreetMap** contributors

---

## Contact

Peder Christensen — pcchristensen1@gmail.com

*Berean is not affiliated with bereanbible.com, berean.ai, bereanapp.com, or any other existing product named Berean.*
