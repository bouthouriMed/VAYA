#!/usr/bin/env bash
# One-time setup: downloads a Tunisia road-network extract and pre-processes
# it into an OSRM routing graph (contraction hierarchies). Re-run this any
# time you want to refresh the underlying map data — it's idempotent.
#
# Usage: ./prepare.sh   (run from anywhere; paths are resolved relative to
# this script's own location, not the caller's cwd)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
PBF_URL="https://download.geofabrik.de/africa/tunisia-latest.osm.pbf"
PBF_FILE="tunisia-latest.osm.pbf"
OSRM_FILE="tunisia-latest.osrm"

mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/$PBF_FILE" ]; then
  echo "Downloading Tunisia OSM extract from Geofabrik..."
  curl -L --fail -o "$DATA_DIR/$PBF_FILE" "$PBF_URL"
else
  echo "Reusing existing $PBF_FILE (delete it to force a fresh download)."
fi

# Git Bash on Windows rewrites leading "/xxx" arguments as if they were local
# paths unless this is set — without it, "/data" below gets mangled before
# docker ever sees it.
export MSYS_NO_PATHCONV=1

echo "Extracting road network (car profile)..."
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua "/data/$PBF_FILE"

echo "Building contraction hierarchies..."
docker run --rm -v "$DATA_DIR:/data" osrm/osrm-backend \
  osrm-contract "/data/$OSRM_FILE"

echo "Done. Start routing with: docker compose up osrm -d"
