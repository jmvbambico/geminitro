# GemiNitro Demo Scripts

Scripts for generating realistic dashboard activity for screenshots, demos, and testing.

## Scripts

### `demo-traffic.sh` - Full Demo Scenario

Comprehensive traffic generator that simulates realistic AI coding agent usage patterns.

**Features:**

- 8 different usage scenarios (morning session, tool calls, thinking, bursts, etc.)
- Uses all available models in rotation
- Realistic coding prompts
- Simulates streaming and non-streaming requests
- Tests key rotation and cooldown recovery
- Multi-turn conversations
- Tool calling demonstrations

**Usage:**

```bash
# Default (localhost:7536)
./scripts/demo-traffic.sh

# Custom URL
GEMINITRO_URL=http://localhost:8080 ./scripts/demo-traffic.sh

# Custom API key
GEMINITRO_API_KEY=your-key ./scripts/demo-traffic.sh

# Both
GEMINITRO_URL=http://localhost:8080 GEMINITRO_API_KEY=your-key ./scripts/demo-traffic.sh
```

**Output:**

- ~50-60 total requests across 8 scenarios
- Runs for approximately 2-3 minutes
- Generates realistic dashboard activity for screenshots

---

### `screenshot-mode.sh` - Continuous Background Activity

Lightweight script that runs continuously to keep the dashboard active and interesting.

**Features:**

- Runs in background indefinitely
- 3-5 requests per minute
- Initial burst for immediate dashboard population
- Minimal resource usage
- Easy to stop (Ctrl+C)

**Usage:**

```bash
# Start in foreground
./scripts/screenshot-mode.sh

# Start in background
./scripts/screenshot-mode.sh &

# Start in background with nohup
nohup ./scripts/screenshot-mode.sh > /dev/null 2>&1 &

# Stop background process
pkill -f screenshot-mode
```

**Perfect for:**

- Taking screenshots while dashboard stays active
- Recording demo videos
- Testing dashboard real-time updates
- Keeping Socket.IO connections alive

---

## Quick Start Guide

### For Screenshots

1. **Start GemiNitro:**

   ```bash
   geminitro start
   ```

2. **Open dashboard:**

   ```bash
   open http://localhost:7536/dashboard
   ```

3. **Generate initial activity:**

   ```bash
   ./scripts/demo-traffic.sh
   ```

4. **Keep dashboard active (optional):**

   ```bash
   ./scripts/screenshot-mode.sh &
   ```

5. **Take screenshots** while traffic flows

6. **Stop continuous mode:**
   ```bash
   pkill -f screenshot-mode
   ```

### For Demo Videos

```bash
# Terminal 1: Start server
geminitro start

# Terminal 2: Continuous background traffic
./scripts/screenshot-mode.sh

# Terminal 3: Run full demo while recording
./scripts/demo-traffic.sh

# Record both terminals and dashboard
```

---

## Environment Variables

| Variable            | Default                 | Description               |
| ------------------- | ----------------------- | ------------------------- |
| `GEMINITRO_URL`     | `http://localhost:7536` | GemiNitro server URL      |
| `GEMINITRO_API_KEY` | `geminitro`             | Proxy API key (from .env) |

---

## Dashboard Views to Capture

When taking screenshots, make sure to capture these views:

1. **Overview Page**
   - Active traffic chart with live requests
   - Model usage pie chart with multiple models
   - Key pool table showing multiple keys in different states
   - System logs with recent activity

2. **Keys Page**
   - Account list with different types (API Key, Antigravity, Gemini CLI)
   - Status badges (active, idle, cooldown)
   - Usage and error counts
   - Add Key modal (open it with logos visible)

3. **Live Activity**
   - Real-time request flow
   - Key rotation in action
   - Cooldown recovery
   - Multiple models being used simultaneously

---

## Tips for Best Screenshots

1. **Timing:**
   - Run `demo-traffic.sh` first to populate data
   - Then run `screenshot-mode.sh` to keep it fresh
   - Take screenshots during active request bursts

2. **Data Variety:**
   - Let the demo run through multiple scenarios
   - Capture different model usage patterns
   - Show key rotation happening (look for status changes)

3. **Dashboard States:**
   - Active keys (green status)
   - Cooldown keys (yellow status)
   - Recent errors (red counts)
   - Live traffic spikes in charts

4. **Clean Presentation:**
   - Wait for initial burst to complete
   - Let charts populate with varied data
   - Ensure multiple keys are visible
   - Show realistic usage distribution

---

## Troubleshooting

**Script fails immediately:**

```bash
# Check if GemiNitro is running
curl http://localhost:7536/api/health

# Check API key
echo $GEMINITRO_API_KEY
```

**No activity in dashboard:**

```bash
# Check server logs
geminitro status

# Verify requests are reaching server
tail -f ~/.geminitro/geminitro.log
```

**Too much/too little traffic:**

```bash
# For demo-traffic.sh: edit sleep values (lines with 'sleep')
# For screenshot-mode.sh: edit delay range (line ~87)

# Quick test - single request
curl -X POST http://localhost:7536/v1/chat/completions \
  -H "Authorization: Bearer geminitro" \
  -H "Content-Type: application/json" \
  -d '{"model":"gemini-2.0-flash-exp","messages":[{"role":"user","content":"test"}]}'
```

---

## Contributing

Feel free to add more scenarios, prompts, or traffic patterns!

- Add new prompts to the `PROMPTS` array
- Add new models to the `MODELS` array
- Create new scenario functions
- Adjust timing for your use case
