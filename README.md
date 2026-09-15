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
- **Live Countdown Ticker**: reset countdowns in the top bar and open menu tick every second (rendered from raw timestamps, never stale between polls).
- **Quota Alerts**: desktop notifications fire the moment a Zhipu account is exhausted (≥95%), recovers, or Antigravity/Codex drops — toggleable in ⚙️ Settings.
- **Themes & Custom Appearance**: Choose from 6 curated themes (**Catppuccin Mocha**, **Nord Frost**, **Dracula Vampire**, **Cyberpunk Neon**, **Minimal Monochrome**, and **Default Cyber**) or customize colors, fonts, and icons directly.
- **Theme Switcher**: Switch themes on the fly via the top-bar dropdown menu or the CLI (`aiacctool theme set catppuccin`).
- **Multi-Account GLM**: Auto-discovers **all** your Z.ai keys (Claude Code settings, OpenCode auth, env vars) and shows **each account separately** in the top bar with its own usage % and reset countdown (e.g. `⚡c 51%⌛3h  ⚡o 100%⌛2h`).
- **Grouped Average for Other Providers**: Antigravity (Claude/Gemini), Codex, and custom APIs collapse into a single averaged badge (e.g. `🌐62%`) without reset times, keeping the top bar compact.
- **Zero-Config Auto Discovery**: Automatically reads existing credentials from `~/.claude/settings.json`, `~/.local/share/opencode/auth.json`, `~/.codex/auth.json`, `~/.9router/db/data.sqlite`, and local process sockets.

---

## Screenshot & Visual Appearance

### Top Bar Indicator
```text
[✦logo] ✦c 15%⌛4h17m · ✦o 80%⌛5m34s · 🕸️6↑
```
- `✦c 15%⌛4h17m` — Zhipu account "claude": 15% used, window resets in 4h17m
- `✦o 80%⌛5m34s` — Zhipu account "opencode": 80% used, resets in 5m34s
- `🕸️6↑` — grouped badge for other providers: 6 upstream accounts online (switches to an averaged `XX%` when Antigravity/Codex report quotas)
- Status icon: Zhipu AI logo when healthy, warning icon when any quota crosses its threshold, offline icon otherwise.
- `panel_format: minimal` renders the ultra-compact form `✦16·22 · 🕸️6↑` (no countdowns).

### Rich Dropdown Menu (Click on Top Bar)
The menu is organized as a compact status list — key numbers at a glance, details one click deep:
- **Status line** — `● GLM 2/2 · 9Router 6↑` or `○ All providers offline`
- **✦ GLM (Zhipu)** — one row per account with a real progress bar, threshold-colored percentage (green → amber → red), and a `⏳` reset chip; a muted sub-line shows tool quota. Exhausted accounts turn red instantly.
- **🌌 Antigravity** — collapsible: Claude Sonnet / Gemini bars with reset chips, plus an "All models" nested list.
- **🤖 Codex** — collapsible: 5-hour and weekly window bars; offline shows a one-line amber status.
- **🔀 9Router** — header shows `6↑ of 19` accounts online; inside, today's request/token totals and a click-to-toggle provider checklist (`☑ glm 2/2`, `☐ nvidia 1/1`, …).
- **🔄 OmniRoute / 📡 Custom APIs** — single status rows when offline; expand automatically when connected.
- Percentages and bars use the active theme's ok/warn/error palette, so exhausted quotas pop visually in every theme.
- **Quick Actions**:
  - 🔄 **Refresh Now**: Instantly re-query all APIs
  - 🎨 **Theme & Presets**: Switch themes live
  - ⚙️ **Settings**: Toggle the status icon, reset countdown, quota alerts, badge format, panel position, and refresh interval — all persisted to `config.json`, no editor required
  - 🌐 **Open 9Router Dashboard**: Launch local/remote router web UI
  - ⚡ **Open Z.ai Console**: Manage API keys
  - 📝 **Edit config.json**: Opens the config in a text editor (not the browser)

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

### 6. Choose & Filter 9Router / OmniRoute Providers:
```bash
# List all upstream providers in 9Router with active connection count
aiacctool router list

# Toggle monitoring for any provider on/off
aiacctool router toggle glm
aiacctool router toggle kiro
aiacctool router toggle gemini-cli
aiacctool router toggle codex
```

### 7. View or change UI options (icon, badge format, position, refresh rate):
```bash
aiacctool option list
aiacctool option set show_icon false
aiacctool option set panel_format standard
aiacctool option set panel_position right
aiacctool option set poll_interval_sec 60
```
All of these are also available interactively in the top-bar menu under **⚙️ Settings** (live switches, no editor needed).

### 8. View or edit configuration:
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
      "auto_detect": true,
      "monitored_providers": ["glm", "kiro", "gemini-cli", "openai-compatible", "codex"]
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
