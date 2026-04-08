# Berean — Data Source Downloads (Phase 0)

Run these downloads before running any build scripts.
All files go into `scripts/source-data/`.

## Already Downloaded ✅
- SBLGNT → `scripts/source-data/sblgnt/`
- MorphGNT → `scripts/source-data/morphgnt/`
- WLC XML → `scripts/source-data/morphhb/`
- Strong's JSON → `scripts/source-data/strongs/`
- STEPBible TBESG → `scripts/source-data/tyndale/`
- OpenScriptures BDB (HebrewLexicon) → `scripts/source-data/bdb/`
- MACULA Greek TSV → `scripts/source-data/macula-greek/`
- unfoldingWord ULT → `scripts/source-data/ult/`
- unfoldingWord UST → `scripts/source-data/ust/`

## Still Needed
- WEB text: https://ebible.org/Scriptures/engwebpb_readaloud.zip → `scripts/source-data/web/`
- SR Greek NT: `git clone https://github.com/Center-for-New-Testament-Restoration/SR scripts/source-data/sr-gnt/`
- Biblica Toleo Wazi (6 SA languages) — download from eBible.org → `scripts/source-data/toleo-wazi/`
- Rahlfs LXX: `git clone https://github.com/eliranwong/LXX-Rahlfs-1935 scripts/source-data/lxx/`
- OpenBible cross-references CSV → `scripts/source-data/crossrefs/`
- OpenBible geocoding GeoJSON → `scripts/source-data/places/`
- Theographic Bible Metadata: `git clone https://github.com/robertrouse/theographic-bible-metadata scripts/source-data/theographic/`
- Nave's Topical Bible JSON → `scripts/source-data/topical/`
- TSK (Treasury of Scripture Knowledge) JSON → `scripts/source-data/tsk/`
- Easton's Bible Dictionary JSONL → `scripts/source-data/eastons/`
- Smith's Bible Dictionary JSON → `scripts/source-data/smiths/`
- OpenText Gospel pericopes JSON → `scripts/source-data/harmony/`
- AOSIS articles (OAI-PMH harvest) → `scripts/source-data/aosis/`

---

## Source URLs and Licence Notes

### Bible Texts
| Source | URL | Licence |
|---|---|---|
| WEB | https://ebible.org/Scriptures/engwebpb_readaloud.zip | Public domain |
| ULT/UST | https://git.door43.org/unfoldingWord/en_ult/releases | CC BY-SA 4.0 |
| SBLGNT | https://github.com/LogosBible/SBLGNT | CC BY 4.0 |
| MorphGNT | https://github.com/morphgnt/sblgnt | CC BY-SA 4.0 |
| SR GNT | https://github.com/Center-for-New-Testament-Restoration/SR | CC BY 4.0 |
| SBLGNT apparatus | https://github.com/schierlm/aligned-bible-corpus-data | CC BY 4.0 |
| WLC | https://github.com/openscriptures/morphhb | Public domain |
| ETCBC BHSA | https://github.com/ETCBC/bhsa | CC BY-NC 4.0 — cite DOI: 10.17026/dans-z6y-skyh |
| Rahlfs LXX | https://github.com/eliranwong/LXX-Rahlfs-1935 | CC BY-NC-SA 4.0 — SEGREGATED DB |

⚠️ BHP: PERMANENTLY DEPRECATED. Alan Bunning archived it late 2023. SR GNT is successor.
⚠️ ULT/UST: GitHub mirrors are 404 — use Door43 release ZIPs only.

### Lexicons
| Source | URL | Licence |
|---|---|---|
| Strong's | https://github.com/openscriptures/strongs | Public domain |
| TBESG (Greek) | https://github.com/tyndale/STEPBible-Data (TBESG*.tsv) | CC BY 4.0 |
| Enhanced BDB | https://github.com/openscriptures/HebrewLexicon | Public domain |
| MACULA Greek | https://github.com/Clear-Bible/macula-greek | CC BY-SA 4.0 |

⚠️ Use HebrewStrong.xml NOT BrownDriverBriggs.xml (wrong ID system).
⚠️ MACULA TSV files at: SBLGNT/tsv/*.tsv — provides Louw-Nida codes per word.

### Commentaries
e-Sword module files (.cmti format — NOT .cmtx which is encrypted).
Download from: biblesupport.com/e-sword-downloads/category/3-commentaries/
Place .cmti files in scripts/source-data/commentaries/

### Other Sources
| Source | URL | Licence |
|---|---|---|
| OpenBible cross-refs | https://openbible.info/labs/cross-references | Public domain |
| Theographic | https://github.com/robertrouse/theographic-bible-metadata | See repo |
| Rahlfs LXX | https://github.com/eliranwong/LXX-Rahlfs-1935 | CC BY-NC-SA 4.0 |
| Biblica Toleo Wazi | eBible.org (Zulu/Xhosa/NSotho/SSotho/Swati/Tsonga) | CC BY-SA 4.0 |

### AOSIS Journals (OAI-PMH — CC BY 4.0)
- In die Skriflig: https://indieskriflig.org.za/index.php/skriflig/oai
- HTS Teologiese Studies: https://hts.org.za/index.php/hts/oai
- Verbum et Ecclesia: https://verbumetecclesia.org.za/index.php/ve/oai
- Acta Theologica: OJS-hosted, CC BY 4.0
- Old Testament Essays: OJS-hosted, CC BY 4.0

⚠️ No central AOSIS aggregator — harvest each journal separately.
⚠️ Use bcv_parser (bible-passage-reference-parser npm) to extract passage refs.
⚠️ resumptionToken pagination required for large collections (HTS: 2,100+ records).

### Gospel Harmony Solution
No single open-licence source for cross-gospel alignment.
Use build-time ETL combining:
1. https://github.com/tyndale/STEPBible-Data (CC BY 4.0) — parallel passage indicators
2. https://github.com/schierlm/aligned-bible-corpus-data (CC BY 4.0) — cross-text OSIS mapping
ETL outputs static JSON: pericope → {mat, mrk, luk, jhn} OSIS ranges.
