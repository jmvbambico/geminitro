#!/bin/bash

# GemiNitro Screenshot Mode
# Quick script for generating dashboard activity for screenshots
# Runs continuously in background to keep dashboard active

set -e

API_BASE="${GEMINITRO_URL:-http://localhost:7536}"
API_KEY="${GEMINITRO_API_KEY:-geminitro}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Models (focusing on most popular)
MODELS=(
  "gemini-2.0-flash-exp"
  "gemini-1.5-flash"
  "gemini-1.5-pro"
  "gemini-2.0-flash-thinking-exp-01-21"
)

# Quick prompts
PROMPTS=(
  "Fix this bug in my code"
  "Write a function to parse JSON"
  "Explain async/await"
  "Create a REST API endpoint"
  "Debug this error"
  "Refactor this component"
  "Write unit tests"
  "Optimize this query"
)

make_quick_request() {
  local model="${MODELS[$RANDOM % ${#MODELS[@]}]}"
  local prompt="${PROMPTS[$RANDOM % ${#PROMPTS[@]}]}"
  local stream=$( [ $((RANDOM % 2)) -eq 0 ] && echo "true" || echo "false" )
  
  curl -s -X POST "${API_BASE}/v1/chat/completions" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"${model}\",
      \"messages\": [{\"role\": \"user\", \"content\": \"${prompt}\"}],
      \"stream\": ${stream},
      \"max_tokens\": 300
    }" > /dev/null 2>&1
}

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          GemiNitro Screenshot Mode - ACTIVE                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Generating continuous dashboard activity${NC}"
echo -e "${YELLOW}📸 Open dashboard:${NC} ${CYAN}${API_BASE}/dashboard${NC}"
echo -e "${YELLOW}⏸  Press Ctrl+C to stop${NC}"
echo ""

# Initial burst for immediate activity
echo -e "${CYAN}⚡ Generating initial traffic burst...${NC}"
for i in {1..20}; do
  make_quick_request &
  sleep 0.2
done
wait
echo -e "${GREEN}✓ Initial burst complete${NC}\n"

# Continuous background traffic
echo -e "${CYAN}🔄 Continuous mode active (3-5 requests/minute)${NC}\n"

counter=1
while true; do
  # Send 1-3 requests
  requests=$((RANDOM % 3 + 1))
  
  for i in $(seq 1 $requests); do
    make_quick_request &
  done
  
  echo -ne "${GREEN}Requests sent: ${counter}${NC}\r"
  counter=$((counter + requests))
  
  # Random delay between 12-20 seconds (3-5 requests per minute)
  sleep $((RANDOM % 9 + 12))
done
