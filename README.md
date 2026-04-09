# Berean

**Free, offline Bible study platform for the whole church, with sermon preparation tools for pastors and Bible teachers.**

Berean is built for every believer, especially those in Africa, who wants to study the Bible seriously without a subscription, an account, or an internet connection. It is permanently free, carries no advertising, and collects no data.

## Who it is for

Berean is for the whole church:
- **Everyday believers** who want to read and study the Bible in depth
- **Small group leaders** preparing discussion and teaching material
- **Pastors and Bible teachers** who need full sermon preparation tools
- **Anyone** who worships in a language other than English and deserves the same quality of Bible software

The platform is particularly focused on South Africa, where millions of believers worship in Afrikaans, isiZulu, isiXhosa, Sesotho, Sepedi, Xitsonga, and Setswana. These languages are underserved by existing Bible software, and Berean is designed to be accessible to anyone who cannot afford commercial tools like Logos, Accordance, or Faithlife.

## Features

### Bible Reading
- Multiple translations in parallel columns
- Full-text search across all installed translations
- Offline reading after first load (no internet required)
- Cross-references, footnotes, and chapter navigation
- Reading plans with progress tracking
- Reading journal with chapter logging and notes
- Interlinear Hebrew and Greek with morphology

### Study Tools
- Lexicon (Strong's, BDB, BDAG) with word study panel
- Commentaries and cross-references
- Biblical geography maps showing passage-relevant locations
- Timeline and entity relationship graph
- Exegetical checklist based on Fee/Stuart and Robinson methodology
- Passage context banner showing the historical period per chapter
- Topical Bible and word cloud

### Sermon Preparation
- Full-featured rich text sermon editor
- Verse clippings (clip any verse directly into a sermon)
- Passage guide covering historical context, literary structure, and theological themes
- Illustration library and citation manager
- Preaching calendar with .ics export
- Presentation mode with teleprompter and dual-screen support
- Export to TXT, Markdown, PDF, and self-contained offline HTML

### Study Sessions
- Create shareable study packs from sermons
- QR code sharing that works fully offline without a server
- Mobile-optimised participant view

### Privacy and Sync
- All notes stored locally in the browser (never sent to any server)
- Optional encrypted backup to GitHub Gist or Google Drive
- AI-assisted study using the user's own API key. No Bible text passes through any server controlled by the developer.

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

We are actively seeking non-commercial distribution licences for South African language translations so that believers can read and study in their heart languages. Translation partners are credited prominently in the application interface and in all documentation.

## Technical architecture

Berean is a static web application. There is no backend server and no database of users.

- Runs entirely in the browser (HTML, CSS, JavaScript)
- Bible text is served as chunked SQLite files via HTTP range requests
- CORS headers and Cloudflare Worker token validation prevent bulk text extraction
- All user data (notes, sermon drafts, API keys) is stored in the browser's own storage and never leaves the device
- AI features are powered by the user's own API key (Gemini, Groq, or Mistral). The developer never sees Bible text or user queries.
- A Service Worker enables full offline operation after first load
- Hosted on Cloudflare Pages (static files only, no server-side execution)

This architecture means translation text is protected at the same level as a compiled app module. It is accessible for reading within the app but cannot be extracted in bulk.

## Licence

Berean is open-source software licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- Free to use, study, modify, and distribute
- Any modified version must also be released under AGPL-3.0
- Running a modified version as a network service requires releasing the source code
- The share-alike terms make commercial exploitation impractical without a separate written agreement

See [LICENSE](LICENSE) for the full licence text.

## Running locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Node.js 18 or later is required.

Bible databases are not included in this repository as they are large binary files. Build scripts are in `scripts/`. See the individual build scripts for source data requirements.

## Contributing

Contributions are welcome, including bug reports, UI translations, accessibility improvements, and new features that serve the mission. Please open an issue before submitting a large pull request so we can discuss the approach first.

## Attribution

- **Berean Standard Bible** (bereanbible.com) CC0 Public Domain
- **SBLGNT** Society of Biblical Literature, CC BY 4.0
- **SR Greek New Testament** Alan Bunning / Center for New Testament Restoration, CC BY 4.0
- **Strong's Lexicon** Public Domain
- **BDAG / BDB** used under academic fair use for non-commercial study
- **Theographic Bible Data** used for timeline and entity data
- Maps powered by Leaflet and OpenStreetMap contributors

## Contact

Peder Christensen: pcchristensen1@gmail.com

*Berean is not affiliated with bereanbible.com, berean.ai, bereanapp.com, or any other existing product named Berean.*
