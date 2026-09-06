# AI Account & Quota Monitor (`aiacctool`)

An integrated Linux top bar indicator and CLI tool to monitor your AI provider accounts, token/request quotas, rate limits, and reset countdowns in real time.

Built natively for **GNOME Shell 46+** (Ubuntu 24.04+) with companion CLI and auto-discovery.

---

## Features

- **Linux Top Bar Integration**: Seamlessly integrates into your GNOME panel right next to your system indicators (matching Vitals style).
- **Live Quotas & Progress Bars**: Shows used / remaining percentages with visual ascii and badge indicators.
- **Accurate Reset Countdowns**: Displays exact reset times (e.g. `2h 31m` or `18:04`) for rolling limits (5-hour, weekly, tool quotas).
- **Provider Support**:
  - **GLM (Z.ai / BigModel)**: Monitors 5-hour token limits and search/tool limits.
  - **Google Antigravity**: Auto-detects local `agy` daemon and tracks individual quotas for Claude Sonnet 4.6, Gemini 3.8/2.5 models, and 30+ available models.
  - **OpenAI Codex**: Connects to the Codex usage endpoint (`wham/usage`) and displays 5-hour and weekly limits.
  - **9Router**: Monitors local/remote router activity, today's request count, and token volume.
  - **OmniRoute**: Monitors local or remote OmniRoute server health and active model pool.
  - **Custom APIs & OpenRouter**: Easily configure custom API endpoints with token authentication and JSON response path extraction.
- **Themes & Custom Appearance**: Choose from 6 curated themes (**Catppuccin Mocha**, **Nord Frost**, **Dracula Vampire**, **Cyberpunk Neon**, **Minimal Monochrome**, and **Default Cyber**) or customize colors, fonts, and icons directly.
- **Theme Switcher**: Switch themes on the fly via the top-bar dropdown menu or the CLI (`aiacctool theme set catppuccin`).
- **Zero-Config Auto Discovery**: Automatically reads existing credentials from `~/.claude/settings.json`, `~/.codex/auth.json`, `~/.9router/db/data.sqlite`, and local process sockets.

---

## Screenshot & Visual Appearance

### Top Bar Indicator
```text
[✓] ⚡0%  🌌43%⏳2h 31m
```
- `⚡0%` — GLM tokens used
- `🌌43%⏳2h 31m` — Antigravity Claude Sonnet quota remaining with reset countdown
- Status icon changes dynamically: green checkmark on healthy, warning icon when quota > 80% used.

### Rich Dropdown Menu (Click on Top Bar)
- **⚡ GLM (Z.ai / BigModel)**
  - Tokens used percentage and progress bar
  - Web search & tool quota (used vs remaining)
- **🌌 Google Antigravity (agy)**
  - Claude Sonnet & Opus quota remaining + reset countdown
  - Gemini 3.8 & Flash models quota remaining + reset countdown
  - Submenu showing quota for all 33 available models
  - Daemon connection info (`127.0.0.1:port`)
- **🤖 OpenAI Codex**
  - 5-hour primary window limit + reset countdown
  - Weekly limit + reset countdown
  - Account/subscription status
- **🔀 9Router**
  - Gateway status (Local or Remote online)
  - Today's total requests and tokens routed
- **🔄 OmniRoute**
  - Gateway status and connected models
- **📡 Custom APIs**
  - Custom endpoint status, usage percentage, and countdowns
- **Quick Actions**:
  - 🔄 **Refresh Now**: Instantly re-query all APIs
  - 🌐 **Open 9Router Dashboard**: Launch local/remote router web UI
  - ⚡ **Open Z.ai Console**: Manage API keys
  - ⚙️ **Edit Configuration**: Open `config.json`

---

## CLI Tool (`aiacctool`)

The tool comes with a fast, colorful command-line interface:

### 1. View all AI accounts & limits:
```bash
aiacctool status
```

### 2. View all Antigravity models in detail:
```bash
aiacctool status -a
```

### 3. Print top bar badge text (for tmux, polybar, or scripts):
```bash
aiacctool topbar
```

### 4. Output raw JSON (for scripting/integrations):
```bash
aiacctool status --json
```

### 5. Switch visual themes:
```bash
aiacctool theme list
aiacctool theme set catppuccin
# Available: default, catppuccin, nord, dracula, cyberpunk, monochrome
```

### 6. View or edit configuration:
```bash
aiacctool config
aiacctool config --edit
```

---

## Configuration (`~/.config/ai-usage-monitor/config.json`)

The configuration file is automatically created at `~/.config/ai-usage-monitor/config.json`:

```json
{
  "theme": "default",
  "poll_interval_sec": 30,
  "panel_format": "compact",
  "show_reset_in_topbar": true,
  "show_icon": true,
  "appearance": {
    "topbar_color": "",
    "topbar_font_size": "12px",
    "topbar_font_weight": "600",
    "topbar_font_family": "",
    "custom_badge_icons": {
      "glm": "⚡",
      "antigravity": "🌌"
    }
  },
  "providers": {
    "glm": {
      "enabled": true,
      "api_key": "",
      "base_url": "https://api.z.ai",
      "auto_detect": true
    },
    "antigravity": {
      "enabled": true,
      "port": 0,
      "auto_detect": true
    },
    "codex": {
      "enabled": true,
      "auth_file": "",
      "auto_detect": true
    },
    "nine_router": {
      "enabled": true,
      "base_url": "http://localhost:20128",
      "remote_url": "",
      "auto_detect": true
    },
    "omniroute": {
      "enabled": true,
      "base_url": "http://localhost:20128",
      "auto_detect": true
    }
  },
  "custom_apis": [
    {
      "name": "Custom Gateway",
      "enabled": false,
      "url": "https://api.example.com/v1/user/usage",
      "method": "GET",
      "headers": {
        "Authorization": "Bearer YOUR_KEY"
      },
      "used_pct_path": "data.used_percent",
      "reset_path": "data.reset_at"
    }
  ]
}
```

---

## File Structure

- `~/.local/bin/aiacctool` — Global CLI binary
- `~/.local/share/gnome-shell/extensions/ai-usage-monitor@ther12k/`:
  - `extension.js` — GNOME Shell 46 panel indicator and dropdown menu
  - `ai-collector.py` — Multi-provider async API polling engine
  - `metadata.json` — GNOME extension descriptor
  - `stylesheet.css` — Menu and panel styling
- `~/.config/ai-usage-monitor/config.json` — User preferences and custom API configs

---

## Restarting / Reloading GNOME Shell

If you edit the extension code:
```bash
DISPLAY=:1 xdotool key "Alt+F2" && sleep 0.5 && DISPLAY=:1 xdotool type "r" && DISPLAY=:1 xdotool key "Return"
```
Or toggle it via CLI:
```bash
gnome-extensions disable ai-usage-monitor@ther12k
gnome-extensions enable ai-usage-monitor@ther12k
```
