#!/usr/bin/env bash
# Simulates the full OAuth 2.1 dance (DCR -> authorize -> consent -> token
# exchange -> /mcp call -> refresh rotation) against a running deployment,
# without needing a real Claude.ai account. Requires curl + python3.
#
# Usage: scripts/verify-oauth.sh https://your-host admin-username admin-password
set -euo pipefail

HOST="${1:?Usage: verify-oauth.sh <host> <admin-username> <admin-password>}"
ADMIN_USER="${2:?Usage: verify-oauth.sh <host> <admin-username> <admin-password>}"
ADMIN_PASS="${3:?Usage: verify-oauth.sh <host> <admin-username> <admin-password>}"
REDIRECT_URI="http://127.0.0.1/callback"
COOKIES="$(mktemp)"

json_get() { python3 -c "import json,sys;print(json.load(sys.stdin)$1)"; }

echo "== 1. Discovery metadata =="
curl -sf "$HOST/.well-known/oauth-authorization-server"; echo
curl -sf "$HOST/.well-known/oauth-protected-resource"; echo

echo "== 2. Dynamic client registration =="
CLIENT=$(curl -sf -X POST "$HOST/oauth/register" -H 'Content-Type: application/json' \
  -d "{\"client_name\":\"verify-script\",\"redirect_uris\":[\"$REDIRECT_URI\"]}")
echo "$CLIENT"
CLIENT_ID=$(echo "$CLIENT" | json_get "['client_id']")

echo "== 3. PKCE pair =="
CODE_VERIFIER=$(python3 -c "import secrets;print(secrets.token_urlsafe(64)[:128])")
CODE_CHALLENGE=$(python3 -c "
import hashlib, base64
print(base64.urlsafe_b64encode(hashlib.sha256('$CODE_VERIFIER'.encode()).digest()).decode().rstrip('='))
")

echo "== 4. Log in (session cookie) =="
CSRF=$(curl -sf -c "$COOKIES" "$HOST/api/auth/csrf" | json_get "['csrfToken']")
curl -sf -b "$COOKIES" -c "$COOKIES" -X POST "$HOST/api/auth/login" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" > /dev/null

echo "== 5. Approve authorization =="
STATE="verify-$(date +%s)"
DECISION=$(curl -sf -b "$COOKIES" -c "$COOKIES" -X POST "$HOST/oauth/authorize/decision" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d "{\"approve\":true,\"client_id\":\"$CLIENT_ID\",\"redirect_uri\":\"$REDIRECT_URI\",\"code_challenge\":\"$CODE_CHALLENGE\",\"code_challenge_method\":\"S256\",\"state\":\"$STATE\"}")
echo "$DECISION"
REDIRECT_TO=$(echo "$DECISION" | json_get "['redirectTo']")
CODE=$(python3 -c "
from urllib.parse import urlparse, parse_qs
print(parse_qs(urlparse('$REDIRECT_TO').query)['code'][0])
")

echo "== 6. Exchange code for tokens =="
TOKENS=$(curl -sf -X POST "$HOST/oauth/token" \
  -d "grant_type=authorization_code" -d "code=$CODE" -d "redirect_uri=$REDIRECT_URI" \
  -d "client_id=$CLIENT_ID" -d "code_verifier=$CODE_VERIFIER")
echo "$TOKENS"
ACCESS_TOKEN=$(echo "$TOKENS" | json_get "['access_token']")
REFRESH_TOKEN=$(echo "$TOKENS" | json_get "['refresh_token']")

echo "== 7. Call /mcp with the OAuth access token =="
curl -sf -X POST "$HOST/mcp" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'; echo

echo "== 8. Confirm 401 + WWW-Authenticate with no token =="
curl -si -X POST "$HOST/mcp" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | grep -iE "^HTTP|www-authenticate"

echo "== 9. Refresh token rotation =="
curl -sf -X POST "$HOST/oauth/token" -d "grant_type=refresh_token" \
  -d "refresh_token=$REFRESH_TOKEN" -d "client_id=$CLIENT_ID"; echo
echo "-- reusing the now-rotated-away refresh token should fail with invalid_grant --"
curl -s -X POST "$HOST/oauth/token" -d "grant_type=refresh_token" \
  -d "refresh_token=$REFRESH_TOKEN" -d "client_id=$CLIENT_ID"; echo

echo "== Done =="
rm -f "$COOKIES"
