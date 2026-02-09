#!/usr/bin/env bash
set -euo pipefail

mkdir -p .sisyphus/evidence
gnome-extensions pack extension --force 2>&1 | tee .sisyphus/evidence/task-0-pack.txt
