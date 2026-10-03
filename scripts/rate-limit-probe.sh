#!/usr/bin/env bash
# Checks that the WAF rate-limit rule on the chat route refuses a client at
# the edge: 25 POSTs to https://matttrifilo.com/api/chat, one after another
# from this machine, printing each status code and the first 429.
#
#   scripts/rate-limit-probe.sh
#
# The rule is the table under "WAF rate-limit rule" in
# docs/career-assistant-operations.md: 20 requests per client in a 60 s
# fixed window, keyed on IP and JA4 digest, answered 429 past that. When it
# counts, request 21 is the first 429. When and how to run this is the
# runbook's "Launch, rehearsal and rollback" section.
#
# Why the body is one the route refuses. The firewall counts a request at
# the edge, before any function runs: per the runbook's "The layers", the
# WAF rule is the only layer that refuses at the edge, while the kill
# switch, BotID and the per-request caps all run inside the function. So
# the rule counts these requests whatever they carry. `{"messages":[]}` is
# a body lib/chat/validate.ts refuses with 400 `invalid` before any model
# call, so even a request that got past BotID would spend no Vertex token.
#
# No BotID header is sent (curl has no BotID client), so the function's
# answer to the requests under the limit is, in the handler's order:
#   503  the kill switch is on (`CHAT_DISABLED=1`); it answers before BotID
#   403  BotID classified the request as a bot (`blocked`), which is what
#        Vercel's documentation says a header-less request gets
#   400  the request reached the validator, so BotID let a request with no
#        classification through: set the kill switch and read the runbook's
#        BotID section
# and 429 comes from the edge, not from the function.
#
# A fixed window can turn over mid-run and split the 25 requests across
# two windows, so a run with no 429 is not yet proof the rule is missing:
# wait a minute and run it once more. Two runs with no 429 mean the rule is
# not counting this client. Counters are per region, and one machine is
# served by one region.
#
# The last line tallies the statuses (`statuses: 403x20 429x5`); that line
# is what goes in the launch record, since a first 429 alone cannot tell a
# BotID refusal from the kill switch.
#
# Exit status: 0 when a 429 was seen, 1 when none was, 2 when the endpoint
# answered something that makes the run unreadable (a redirect, or no
# response at all), 3 when any request answered 400, whatever else the run
# saw, because that means BotID let a request with no classification
# through.
set -euo pipefail

readonly URL='https://matttrifilo.com/api/chat'
readonly BODY='{"messages":[]}'
readonly REQUESTS=25

first_429=''
reached_validator=0
statuses=''
started=$(date +%s)

for i in $(seq 1 "$REQUESTS"); do
  # No -L: a redirect would be answered by the redirect, not by the rule,
  # and must stop the run rather than be followed with a changed method.
  status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 10 \
    --request POST \
    --header 'content-type: application/json' \
    --data "$BODY" \
    "$URL") || status='000'
  elapsed=$(($(date +%s) - started))
  printf '%2d  %s  (%ds)\n' "$i" "$status" "$elapsed"
  statuses="$statuses $status"

  case "$status" in
  000)
    echo "Request $i got no response; the run cannot say anything about the rule." >&2
    exit 2
    ;;
  3??)
    echo "Request $i was redirected ($status); the rule never saw it. Check the host." >&2
    exit 2
    ;;
  400)
    reached_validator=$((reached_validator + 1))
    ;;
  429)
    if [ -z "$first_429" ]; then first_429=$i; fi
    ;;
  esac
done

elapsed=$(($(date +%s) - started))
# One "403x20" entry per distinct status, in numeric order.
# shellcheck disable=SC2086 # split on the spaces between statuses on purpose
tally=$(printf '%s\n' $statuses | sort | uniq -c |
  awk '{ printf "%s%sx%s", (NR > 1 ? " " : ""), $2, $1 }')

echo
if [ -n "$first_429" ]; then
  echo "First 429 at request $first_429 of $REQUESTS, ${elapsed}s for the run."
  if [ "$first_429" -lt 21 ]; then
    echo "Expected request 21. Earlier means the counter already held requests from this window: an earlier run, or another client counted as this one."
  elif [ "$first_429" -gt 21 ]; then
    echo "Expected request 21. Later means the window turned over during the run."
  fi
  outcome=0
else
  echo "No 429 in $REQUESTS requests over ${elapsed}s."
  if [ "$elapsed" -ge 60 ]; then
    echo "The run took a minute or more, so it spanned more than one window; that alone can explain it."
  fi
  echo "Wait a minute and run it once more; two runs with no 429 mean the rule is not counting this client."
  outcome=1
fi

if [ "$reached_validator" -gt 0 ]; then
  echo "$reached_validator request(s) answered 400: BotID let a request with no classification reach the validator. Set the kill switch and read the runbook's BotID section." >&2
  outcome=3
fi

echo "statuses: $tally"
exit "$outcome"
