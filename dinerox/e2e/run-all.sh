#!/usr/bin/env bash
# Lance tous les parcours de bout en bout. Prérequis : émulateurs démarrés et export servi (voir README).
set -u
cd "$(dirname "$0")"
status=0
for t in signup-fields.js forms-audit.js multi-users.js coach-budget.js coach-open.js coach-voice.js coach-rewards.js coach-score.js coach-advice.js lot-a-nav.js; do
  echo "== $t"
  node "$t" "${E2E_SHOTS:-/tmp}" || status=1
done
exit $status
