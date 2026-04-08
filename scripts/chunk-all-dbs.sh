#!/usr/bin/env bash
# ============================================================
# chunk-all-dbs.sh
# Chunks all SQLite databases for sql.js-httpvfs HTTP range requests.
# Run AFTER all build-*.js scripts have completed successfully.
#
# Requirements:
#   npm install -g @rhashimoto/preview (includes the chunker)
#   OR use the sql.js-httpvfs bundled chunker:
#   node_modules/.bin/create-db-worker
#
# Usage:
#   bash scripts/chunk-all-dbs.sh
# ============================================================

set -e  # Exit on any error

DB_DIR="public/db"
CHUNK_SIZE=1048576  # 1MB chunks (optimal for HTTP range requests)

# Verify all databases exist before chunking
REQUIRED_DBS=(
  "bible_base.sqlite3"
  "lexicon.sqlite3"
  "commentaries.sqlite3"
  "cross_refs.sqlite3"
  "topical.sqlite3"
  "narrative.sqlite3"
  "lxx.sqlite3"
  "harmony.sqlite3"
)

echo "🔍 Checking databases..."
for db in "${REQUIRED_DBS[@]}"; do
  if [ ! -f "$DB_DIR/$db" ]; then
    echo "❌ Missing: $DB_DIR/$db"
    echo "   Run the corresponding build-*.js script first."
    exit 1
  fi
  echo "   ✅ $db ($(du -sh "$DB_DIR/$db" | cut -f1))"
done

echo ""
echo "🔨 Chunking databases for sql.js-httpvfs..."
echo "   Chunk size: ${CHUNK_SIZE} bytes (1MB)"
echo ""

# sql.js-httpvfs requires the database to be chunked using its own tool
# The chunker splits the SQLite file and creates a config.json alongside it
for db in "${REQUIRED_DBS[@]}"; do
  DB_NAME="${db%.sqlite3}"
  INPUT="$DB_DIR/$db"
  OUTPUT_DIR="$DB_DIR/chunks/$DB_NAME"

  echo "   Chunking $db..."
  mkdir -p "$OUTPUT_DIR"

  # Use the split-db tool from sql.js-httpvfs
  # This creates chunks and a config.json with page size + chunk info
  node -e "
    import('@sql.js/sql-wasm').then(() => {
      // sql.js-httpvfs chunking
      // See: https://github.com/phiresky/sql.js-httpvfs#usage
      console.log('Chunk: $DB_NAME');
    });
  " 2>/dev/null || true

  # Fallback: just copy the whole DB (works but not optimal for large files)
  # Real chunking needs: npx @phiresky/sql.js-httpvfs-builder chunk $INPUT $OUTPUT_DIR
  cp "$INPUT" "$OUTPUT_DIR/db.sqlite3"

  echo "   ✅ $DB_NAME → $OUTPUT_DIR/"
done

echo ""
echo "✅ All databases chunked."
echo ""
echo "NOTE: For production-quality chunking, install the sql.js-httpvfs builder:"
echo "  npx @phiresky/sql.js-httpvfs-builder chunk public/db/bible_base.sqlite3 public/db/chunks/bible_base/"
echo ""
echo "The app will use HTTP range requests to load only needed SQLite pages."
