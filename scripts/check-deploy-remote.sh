#!/usr/bin/env bash
# Verify that what is deployed matches what was committed.
#
# WHY THIS EXISTS
# This repo has TWO remotes with near-identical names, and only one of them is
# wired to Vercel:
#
#   origin -> github.com/sasha463111/amit-maymon-new   (NOT deployed)
#   tomer  -> github.com/tdavidyan85/amit-maymon-new   (THIS is production)
#
# `main` tracks origin, so a plain `git push` goes to the remote that deploys
# nothing — silently. On 2026-09-25 this was discovered after 20 commits had
# accumulated: production had been running code from 17.09 for over a week
# while database migrations were applied live, leaving old code against a new
# schema. Everything looked pushed. Nothing was deployed.
#
# Run this after pushing, or any time production behaves like an older build.

set -uo pipefail
cd "$(dirname "$0")/.."

DEPLOY_REMOTE="tomer"
BRANCH="main"

git fetch "$DEPLOY_REMOTE" "$BRANCH" --quiet 2>/dev/null || {
  echo "✗ cannot reach the '$DEPLOY_REMOTE' remote"; exit 1;
}

BEHIND=$(git rev-list --count "$DEPLOY_REMOTE/$BRANCH..$BRANCH" 2>/dev/null || echo "?")

if [ "$BEHIND" = "0" ]; then
  echo "✓ production is up to date — $DEPLOY_REMOTE/$BRANCH matches local $BRANCH"
  echo "  $(git log -1 --format='%h %s' "$DEPLOY_REMOTE/$BRANCH")"
  exit 0
fi

echo "✗ $BEHIND commit(s) committed locally but NOT deployed:"
echo
git log --oneline "$DEPLOY_REMOTE/$BRANCH..$BRANCH" | sed 's/^/    /'
echo
echo "  Production is running:"
echo "    $(git log -1 --format='%h %s (%ad)' --date=short "$DEPLOY_REMOTE/$BRANCH")"
echo
echo "  Fix:  git push $DEPLOY_REMOTE $BRANCH"
exit 1
