#!/bin/bash

# GemiNitro Demo Traffic Generator
# Simulates realistic AI coding agent usage for dashboard screenshots

set -e

API_BASE="${GEMINITRO_URL:-http://localhost:7536}"
API_KEY="${GEMINITRO_API_KEY:-geminitro}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Models to cycle through
MODELS=(
  "gemini-2.0-flash-exp"
  "gemini-1.5-flash"
  "gemini-1.5-pro"
  "gemini-2.0-flash-thinking-exp-01-21"
  "gemini-exp-1206"
)

# Realistic coding prompts
PROMPTS=(
  "Write a function to validate email addresses in JavaScript"
  "Explain the difference between const, let, and var in JavaScript"
  "Create a REST API endpoint for user authentication using Express"
  "How do I implement pagination in a SQL query?"
  "Debug this TypeError: Cannot read property 'map' of undefined"
  "Write a React hook for fetching data with loading states"
  "Implement binary search in Python with type hints"
  "What's the time complexity of quicksort and mergesort?"
  "Create a Dockerfile for a Node.js application"
  "Explain how async/await works under the hood"
  "Write unit tests for a shopping cart class"
  "How do I prevent SQL injection in prepared statements?"
  "Implement a LRU cache in TypeScript"
  "Refactor this code to use async/await instead of callbacks"
  "Create a CI/CD pipeline with GitHub Actions"
)

# Function to generate a random prompt
get_random_prompt() {
  echo "${PROMPTS[$RANDOM % ${#PROMPTS[@]}]}"
}

# Function to get a random model
get_random_model() {
  echo "${MODELS[$RANDOM % ${#MODELS[@]}]}"
}

# Function to make a chat completion request
make_request() {
  local model="$1"
  local prompt="$2"
  local stream="${3:-false}"
  
  echo -e "${CYAN}📤 Request${NC} → Model: ${YELLOW}${model}${NC} | Stream: ${stream}"
  echo -e "${MAGENTA}💬 Prompt:${NC} ${prompt:0:60}..."
  
  if [ "$stream" = "true" ]; then
    curl -s -N -X POST "${API_BASE}/v1/chat/completions" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{
        \"model\": \"${model}\",
        \"messages\": [{\"role\": \"user\", \"content\": \"${prompt}\"}],
        \"stream\": true,
        \"max_tokens\": 500
      }" | head -n 20 > /dev/null
  else
    curl -s -X POST "${API_BASE}/v1/chat/completions" \
      -H "Authorization: Bearer ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{
        \"model\": \"${model}\",
        \"messages\": [{\"role\": \"user\", \"content\": \"${prompt}\"}],
        \"max_tokens\": 300
      }" > /dev/null
  fi
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Success${NC}\n"
  else
    echo -e "${RED}✗ Failed${NC}\n"
  fi
}

# Function to make a tool call request
make_tool_call_request() {
  local model="$1"
  
  echo -e "${CYAN}📤 Tool Call Request${NC} → Model: ${YELLOW}${model}${NC}"
  echo -e "${MAGENTA}🔧 Tools:${NC} get_weather, search_docs"
  
  curl -s -X POST "${API_BASE}/v1/chat/completions" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "'"${model}"'",
      "messages": [{"role": "user", "content": "What'\''s the weather in Tokyo and can you search our docs for API rate limits?"}],
      "tools": [
        {
          "type": "function",
          "function": {
            "name": "get_weather",
            "description": "Get current weather in a location",
            "parameters": {
              "type": "object",
              "properties": {
                "location": {"type": "string", "description": "City name"}
              },
              "required": ["location"]
            }
          }
        },
        {
          "type": "function",
          "function": {
            "name": "search_docs",
            "description": "Search documentation",
            "parameters": {
              "type": "object",
              "properties": {
                "query": {"type": "string", "description": "Search query"}
              },
              "required": ["query"]
            }
          }
        }
      ],
      "max_tokens": 300
    }' > /dev/null
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tool calls executed${NC}\n"
  else
    echo -e "${RED}✗ Failed${NC}\n"
  fi
}

# Function to make a thinking model request
make_thinking_request() {
  local model="gemini-2.0-flash-thinking-exp-01-21"
  
  echo -e "${CYAN}📤 Thinking Request${NC} → Model: ${YELLOW}${model}${NC}"
  echo -e "${MAGENTA}🧠 Reasoning:${NC} Extended thinking enabled"
  
  curl -s -X POST "${API_BASE}/v1/chat/completions" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "'"${model}"'",
      "messages": [{"role": "user", "content": "Solve this algorithm problem: Given an array of integers, find the longest increasing subsequence. Explain your thought process."}],
      "thinking": {
        "type": "enabled",
        "budget_tokens": 5000
      },
      "max_tokens": 1000
    }' > /dev/null
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Thinking complete${NC}\n"
  else
    echo -e "${RED}✗ Failed${NC}\n"
  fi
}

# Main demo scenarios
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       GemiNitro Dashboard Demo Traffic Generator          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Target: ${GREEN}${API_BASE}${NC}"
echo -e "API Key: ${GREEN}${API_KEY:0:8}...${NC}"
echo ""
echo -e "${YELLOW}⚡ Starting realistic traffic simulation...${NC}"
echo ""

# Scenario 1: Morning coding session (rapid requests)
echo -e "${BLUE}━━━ Scenario 1: Morning Coding Session ━━━${NC}\n"
for i in {1..8}; do
  model=$(get_random_model)
  prompt=$(get_random_prompt)
  stream=$( [ $((RANDOM % 2)) -eq 0 ] && echo "true" || echo "false" )
  make_request "$model" "$prompt" "$stream"
  sleep $((RANDOM % 3 + 1))
done

# Scenario 2: Tool calling workflow
echo -e "${BLUE}━━━ Scenario 2: Tool Calling Workflow ━━━${NC}\n"
for i in {1..3}; do
  make_tool_call_request "gemini-2.0-flash-exp"
  sleep 2
done

# Scenario 3: Deep thinking session
echo -e "${BLUE}━━━ Scenario 3: Complex Problem Solving ━━━${NC}\n"
for i in {1..2}; do
  make_thinking_request
  sleep 3
done

# Scenario 4: Model comparison (same prompt, different models)
echo -e "${BLUE}━━━ Scenario 4: Model Comparison ━━━${NC}\n"
test_prompt="Implement a rate limiter using the token bucket algorithm in TypeScript"
for model in "${MODELS[@]}"; do
  make_request "$model" "$test_prompt" "false"
  sleep 1
done

# Scenario 5: Burst traffic (key rotation test)
echo -e "${BLUE}━━━ Scenario 5: Burst Traffic (Key Rotation) ━━━${NC}\n"
echo -e "${YELLOW}⚡ Sending 15 rapid requests to trigger key rotation...${NC}\n"
for i in {1..15}; do
  model=$(get_random_model)
  prompt=$(get_random_prompt)
  echo -ne "${CYAN}Request $i/15${NC}\r"
  make_request "$model" "$prompt" "false" 2>/dev/null
  sleep 0.5
done
echo ""

# Scenario 6: Streaming responses
echo -e "${BLUE}━━━ Scenario 6: Streaming Responses ━━━${NC}\n"
for i in {1..5}; do
  model=$(get_random_model)
  prompt=$(get_random_prompt)
  make_request "$model" "$prompt" "true"
  sleep 2
done

# Scenario 7: Edge cases
echo -e "${BLUE}━━━ Scenario 7: Edge Cases ━━━${NC}\n"

# Long prompt
echo -e "${CYAN}📤 Long Prompt Test${NC}"
long_prompt="Explain in detail how to build a complete REST API with authentication, rate limiting, error handling, logging, database connection pooling, caching, and API documentation. Include code examples for each component."
make_request "gemini-1.5-pro" "$long_prompt" "false"
sleep 2

# Multi-turn conversation
echo -e "${CYAN}📤 Multi-turn Conversation${NC}"
curl -s -X POST "${API_BASE}/v1/chat/completions" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [
      {"role": "user", "content": "What is React?"},
      {"role": "assistant", "content": "React is a JavaScript library for building user interfaces."},
      {"role": "user", "content": "Show me a simple component example"}
    ],
    "max_tokens": 300
  }' > /dev/null
echo -e "${GREEN}✓ Multi-turn complete${NC}\n"
sleep 2

# Scenario 8: Final burst for dashboard activity
echo -e "${BLUE}━━━ Scenario 8: Final Activity Burst ━━━${NC}\n"
for i in {1..10}; do
  model=$(get_random_model)
  prompt=$(get_random_prompt)
  stream=$( [ $((RANDOM % 3)) -eq 0 ] && echo "true" || echo "false" )
  make_request "$model" "$prompt" "$stream" 2>/dev/null &
  sleep 0.3
done
wait

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Demo Traffic Generation Complete              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}📊 Check your dashboard at:${NC} ${CYAN}${API_BASE}/dashboard${NC}"
echo -e "${YELLOW}💡 Tip:${NC} Run this script in the background while taking screenshots"
echo ""
echo -e "${BLUE}Example usage:${NC}"
echo -e "  ${GREEN}./scripts/demo-traffic.sh${NC}                    # Default (localhost:7536)"
echo -e "  ${GREEN}GEMINITRO_URL=http://localhost:8080 ./scripts/demo-traffic.sh${NC}"
echo ""
