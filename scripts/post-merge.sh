#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
npm install --no-audit --no-fund --silent

echo "[post-merge] Done. Schema migrations will run on next server boot via pushSchema()."
