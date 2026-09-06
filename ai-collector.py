#!/usr/bin/env python3
"""
AI Account & Usage Collector
Collects real-time usage, limits, and reset countdowns for:
- GLM (Z.ai / BigModel)
- Google Antigravity (Local Language Server / agy)
- OpenAI Codex (wham/usage)
- 9Router (Local SQLite DB + local/remote dashboard API)
- OmniRoute (Local/remote gateway)
- OpenRouter / Custom APIs

Includes rich theming system (Catppuccin, Nord, Dracula, Cyberpunk, Monochrome, Default)
and custom fonts, colors, and icons.
"""

import os
import sys
import json
import time
import re
import datetime
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "ai-usage-monitor"
CONFIG_FILE = CONFIG_DIR / "config.json"

THEME_PRESETS = {
    "default": {
        "name": "Default Cyber",
        "topbar_color": "#8ab4f8",
        "topbar_font_weight": "600",
        "topbar_font_size": "12px",
        "topbar_font_family": "",
        "icon_ok": "emblem-default-symbolic",
        "icon_warn": "dialog-warning-symbolic",
        "icon_err": "network-offline-symbolic",
        "menu_header_color": "#8ab4f8",
        "menu_section_color": "#e8eaed",
        "menu_ok_color": "#81c995",
        "menu_warn_color": "#fdd663",
        "menu_err_color": "#f28b82",
        "menu_muted_color": "#9aa0a6",
        "badge_icons": {
            "glm": "⚡",
            "antigravity": "🌌",
            "codex": "🤖",
            "nine_router": "🔀",
            "omniroute": "🔄",
            "custom": "📡",
            "reset": "⏳"
        }
    },
    "catppuccin": {
        "name": "Catppuccin Mocha",
        "topbar_color": "#cba6f7",       # Mauve
        "topbar_font_weight": "bold",
        "topbar_font_size": "12px",
        "topbar_font_family": "",
        "icon_ok": "weather-clear-symbolic",
        "icon_warn": "weather-few-clouds-symbolic",
        "icon_err": "weather-storm-symbolic",
        "menu_header_color": "#cba6f7",
        "menu_section_color": "#89b4fa",  # Blue
        "menu_ok_color": "#a6e3a1",       # Green
        "menu_warn_color": "#f9e2af",     # Yellow
        "menu_err_color": "#f38ba8",      # Red
        "menu_muted_color": "#9399b2",
        "badge_icons": {
            "glm": "⚡",
            "antigravity": "🌸",
            "codex": "🐱",
            "nine_router": "🔀",
            "omniroute": "🔄",
            "custom": "📡",
            "reset": "⏱"
        }
    },
    "nord": {
        "name": "Nord Frost",
        "topbar_color": "#88c0d0",       # Frost Cyan
        "topbar_font_weight": "600",
        "topbar_font_size": "12px",
        "topbar_font_family": "",
        "icon_ok": "starred-symbolic",
        "icon_warn": "dialog-warning-symbolic",
        "icon_err": "process-stop-symbolic",
        "menu_header_color": "#88c0d0",
        "menu_section_color": "#81a1c1",
        "menu_ok_color": "#a3be8c",       # Aurora Green
        "menu_warn_color": "#ebcb8b",     # Aurora Yellow
        "menu_err_color": "#bf616a",      # Aurora Red
        "menu_muted_color": "#d8dee9",
        "badge_icons": {
            "glm": "❄️",
            "antigravity": "🧊",
            "codex": "🤖",
            "nine_router": "⇄",
            "omniroute": "🔄",
            "custom": "📡",
            "reset": "⏳"
        }
    },
    "dracula": {
        "name": "Dracula Vampire",
        "topbar_color": "#bd93f9",       # Purple
        "topbar_font_weight": "bold",
        "topbar_font_size": "12px",
        "topbar_font_family": "",
        "icon_ok": "security-high-symbolic",
        "icon_warn": "dialog-warning-symbolic",
        "icon_err": "dialog-error-symbolic",
        "menu_header_color": "#ff79c6",   # Pink
        "menu_section_color": "#bd93f9",  # Purple
        "menu_ok_color": "#50fa7b",       # Green
        "menu_warn_color": "#f1fa8c",     # Yellow
        "menu_err_color": "#ff5555",      # Red
        "menu_muted_color": "#6272a4",    # Comment
        "badge_icons": {
            "glm": "⚡",
            "antigravity": "🦇",
            "codex": "💀",
            "nine_router": "🩸",
            "omniroute": "🔄",
            "custom": "📡",
            "reset": "⌛"
        }
    },
    "cyberpunk": {
        "name": "Cyberpunk Neon",
        "topbar_color": "#00ffcc",       # Neon Cyan
        "topbar_font_weight": "bold",
        "topbar_font_size": "12px",
        "topbar_font_family": "",
        "icon_ok": "software-update-available-symbolic",
        "icon_warn": "dialog-warning-symbolic",
        "icon_err": "process-stop-symbolic",
        "menu_header_color": "#ff007f",   # Neon Pink
        "menu_section_color": "#00ffcc",  # Neon Cyan
        "menu_ok_color": "#39ff14",       # Neon Green
        "menu_warn_color": "#ffe600",     # Neon Yellow
        "menu_err_color": "#ff073a",      # Neon Red
        "menu_muted_color": "#708090",
        "badge_icons": {
            "glm": "⚡",
            "antigravity": "🪐",
            "codex": "👾",
            "nine_router": "🔀",
            "omniroute": "🔄",
            "custom": "📡",
            "reset": "⏳"
        }
    },
    "monochrome": {
        "name": "Minimal Monochrome",
        "topbar_color": "#ffffff",
        "topbar_font_weight": "normal",
        "topbar_font_size": "11px",
        "topbar_font_family": "monospace",
        "icon_ok": "radio-checked-symbolic",
        "icon_warn": "dialog-warning-symbolic",
        "icon_err": "dialog-error-symbolic",
        "menu_header_color": "#ffffff",
        "menu_section_color": "#cccccc",
        "menu_ok_color": "#ffffff",
        "menu_warn_color": "#dddddd",
        "menu_err_color": "#888888",
        "menu_muted_color": "#777777",
        "badge_icons": {
            "glm": "[GLM]",
            "antigravity": "[AG]",
            "codex": "[CDX]",
            "nine_router": "[R9]",
            "omniroute": "[OMN]",
            "custom": "[API]",
            "reset": "->"
        }
    }
}

DEFAULT_CONFIG = {
    "theme": "default",
    "poll_interval_sec": 30,
    "panel_format": "compact",  # "compact", "standard", "full", "minimal"
    "show_reset_in_topbar": True,
    "show_icon": True,
    "appearance": {
        "topbar_color": "",
        "topbar_font_size": "",
        "topbar_font_weight": "",
        "topbar_font_family": "",
        "custom_badge_icons": {}
    },
    "providers": {
        "glm": {
            "enabled": True,
            "api_key": "",
            "base_url": "https://api.z.ai",
            "auto_detect": True
        },
        "antigravity": {
            "enabled": True,
            "port": 0,
            "auto_detect": True
        },
        "codex": {
            "enabled": True,
            "auth_file": "",
            "auto_detect": True
        },
        "nine_router": {
            "enabled": True,
            "base_url": "http://localhost:20128",
            "remote_url": "",
            "auto_detect": True
        },
        "omniroute": {
            "enabled": True,
            "base_url": "http://localhost:20128",
            "auto_detect": True
        },
        "openrouter": {
            "enabled": False,
            "api_key": ""
        }
    },
    "custom_apis": [
        {
            "name": "Custom Proxy",
            "enabled": False,
            "url": "https://api.example.com/v1/user/usage",
            "method": "GET",
            "headers": {"Authorization": "Bearer YOUR_KEY"},
            "used_pct_path": "data.used_percent",
            "reset_path": "data.reset_at"
        }
    ]
}


def load_config():
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        with open(CONFIG_FILE, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, "r") as f:
            cfg = json.load(f)
            # Ensure default keys
            for k, v in DEFAULT_CONFIG.items():
                if k not in cfg:
                    cfg[k] = v
            if "providers" not in cfg:
                cfg["providers"] = DEFAULT_CONFIG["providers"]
            else:
                for pk, pv in DEFAULT_CONFIG["providers"].items():
                    if pk not in cfg["providers"]:
                        cfg["providers"][pk] = pv
            return cfg
    except Exception:
        return DEFAULT_CONFIG


def save_config(cfg):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def get_active_theme(cfg):
    theme_name = cfg.get("theme", "default")
    base_theme = THEME_PRESETS.get(theme_name, THEME_PRESETS["default"]).copy()

    # Apply user overrides from appearance
    app = cfg.get("appearance", {})
    if app.get("topbar_color"):
        base_theme["topbar_color"] = app["topbar_color"]
    if app.get("topbar_font_size"):
        base_theme["topbar_font_size"] = app["topbar_font_size"]
    if app.get("topbar_font_weight"):
        base_theme["topbar_font_weight"] = app["topbar_font_weight"]
    if app.get("topbar_font_family"):
        base_theme["topbar_font_family"] = app["topbar_font_family"]

    custom_badges = app.get("custom_badge_icons", {})
    if custom_badges:
        merged_badges = base_theme.get("badge_icons", {}).copy()
        merged_badges.update(custom_badges)
        base_theme["badge_icons"] = merged_badges

    base_theme["theme_id"] = theme_name
    return base_theme


def make_ascii_bar(pct, length=10):
    if pct is None:
        return ""
    try:
        val = max(0, min(100, float(pct)))
        filled = int(round((val / 100.0) * length))
        return "█" * filled + "░" * (length - filled)
    except Exception:
        return ""


def format_countdown_ms(target_ms):
    if not target_ms:
        return ""
    diff_sec = max(0, int((target_ms - time.time() * 1000) / 1000))
    if diff_sec <= 0:
        return "Resetting"
    h = diff_sec // 3600
    m = (diff_sec % 3600) // 60
    s = diff_sec % 60
    if h > 0:
        return f"{h}h {m}m"
    elif m > 0:
        return f"{m}m {s}s"
    return f"{s}s"


def format_countdown_iso(iso_str):
    if not iso_str:
        return ""
    try:
        clean_str = iso_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean_str)
        target_ms = dt.timestamp() * 1000
        return format_countdown_ms(target_ms)
    except Exception:
        return ""


def format_local_time_iso(iso_str):
    if not iso_str:
        return ""
    try:
        clean_str = iso_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean_str).astimezone()
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def format_local_time_ms(ms):
    if not ms:
        return ""
    try:
        dt = datetime.datetime.fromtimestamp(ms / 1000.0)
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def check_glm(cfg):
    glm_cfg = cfg.get("providers", {}).get("glm", {})
    if not glm_cfg.get("enabled", True):
        return {"enabled": False, "status": "disabled"}

    token = glm_cfg.get("api_key")
    if not token and glm_cfg.get("auto_detect", True):
        claude_path = Path.home() / ".claude" / "settings.json"
        if claude_path.exists():
            try:
                with open(claude_path) as f:
                    c_data = json.load(f)
                    token = c_data.get("env", {}).get("ANTHROPIC_AUTH_TOKEN") or c_data.get("env", {}).get("ANTHROPIC_API_KEY")
            except Exception:
                pass
        if not token:
            token = os.environ.get("ZAI_API_KEY") or os.environ.get("ZHIPU_API_KEY")

    if not token:
        return {"enabled": True, "status": "not_configured", "error": "No Z.ai API key"}

    base_url = glm_cfg.get("base_url", "https://api.z.ai").rstrip("/")
    url = f"{base_url}/api/monitor/usage/quota/limit"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": token,
            "Accept-Language": "en-US,en",
            "User-Agent": "aiacctool-monitor"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            limits = data.get("data", {}).get("limits", [])
            token_limit = next((l for l in limits if l.get("type") == "TOKENS_LIMIT"), None)
            time_limit = next((l for l in limits if l.get("type") == "TIME_LIMIT"), None)

            token_used = token_limit.get("percentage") if token_limit else None
            token_reset_ms = token_limit.get("nextResetTime") if token_limit else None
            time_used = time_limit.get("percentage") if time_limit else None
            time_reset_ms = time_limit.get("nextResetTime") if time_limit else None

            return {
                "enabled": True,
                "status": "ok",
                "level": data.get("data", {}).get("level", "Standard"),
                "token_quota": {
                    "used_pct": token_used,
                    "remaining_pct": (100 - token_used) if token_used is not None else None,
                    "bar": make_ascii_bar(token_used),
                    "reset_ms": token_reset_ms,
                    "countdown": format_countdown_ms(token_reset_ms),
                    "reset_time": format_local_time_ms(token_reset_ms)
                },
                "tool_quota": {
                    "used_pct": time_used,
                    "remaining_pct": (100 - time_used) if time_used is not None else None,
                    "bar": make_ascii_bar(time_used),
                    "current": time_limit.get("currentValue") if time_limit else None,
                    "remaining": time_limit.get("remaining") if time_limit else None,
                    "reset_ms": time_reset_ms,
                    "countdown": format_countdown_ms(time_reset_ms),
                    "reset_time": format_local_time_ms(time_reset_ms)
                }
            }
    except urllib.error.HTTPError as he:
        return {"enabled": True, "status": "error", "error": f"HTTP {he.code}"}
    except Exception as e:
        return {"enabled": True, "status": "error", "error": str(e)}


def check_antigravity(cfg):
    ag_cfg = cfg.get("providers", {}).get("antigravity", {})
    if not ag_cfg.get("enabled", True):
        return {"enabled": False, "status": "disabled"}

    port = ag_cfg.get("port", 0)
    ports_to_try = [port] if port > 0 else []

    if ag_cfg.get("auto_detect", True):
        try:
            res = subprocess.run(["ss", "-tlnp"], capture_output=True, text=True, timeout=2)
            for line in res.stdout.splitlines():
                if "agy" in line and "127.0.0.1:" in line:
                    m = re.search(r"127\.0\.0\.1:(\d+)", line)
                    if m:
                        p = int(m.group(1))
                        if p not in ports_to_try:
                            ports_to_try.append(p)
        except Exception:
            pass

        if not ports_to_try:
            log_path = Path.home() / ".gemini" / "antigravity-cli" / "cli.log"
            if log_path.exists():
                try:
                    with open(log_path, "r", errors="ignore") as f:
                        for line in f.readlines()[-20:]:
                            m = re.search(r"listening on random port at (\d+) for HTTP", line)
                            if m:
                                p = int(m.group(1))
                                if p not in ports_to_try:
                                    ports_to_try.append(p)
                except Exception:
                    pass

    for p in ports_to_try:
        url = f"http://127.0.0.1:{p}/exa.language_server_pb.LanguageServerService/GetAvailableModels"
        req = urllib.request.Request(
            url,
            data=b"{}",
            headers={"Content-Type": "application/json", "User-Agent": "aiacctool-monitor"}
        )
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                data = json.loads(resp.read().decode())
                models = data.get("response", {}).get("models", {})
                if not models:
                    continue

                highlighted = {}
                for m_id, m_data in models.items():
                    quota = m_data.get("quotaInfo")
                    if quota:
                        rem = quota.get("remainingFraction")
                        rst = quota.get("resetTime")
                        used_p = round((1 - rem) * 100, 1) if rem is not None else None
                        rem_p = round(rem * 100, 1) if rem is not None else None
                        highlighted[m_id] = {
                            "remaining_pct": rem_p,
                            "used_pct": used_p,
                            "bar": make_ascii_bar(rem_p),
                            "reset_iso": rst,
                            "countdown": format_countdown_iso(rst) if rst else "Ready",
                            "reset_time": format_local_time_iso(rst)
                        }

                sonnet = highlighted.get("claude-sonnet-4-6") or highlighted.get("claude-opus-4-6-thinking")
                gemini = highlighted.get("gemini-3.8-flash-high") or highlighted.get("gemini-2.5-flash")

                return {
                    "enabled": True,
                    "status": "ok",
                    "port": p,
                    "models_count": len(models),
                    "claude_sonnet": sonnet,
                    "gemini": gemini,
                    "models": highlighted
                }
        except Exception:
            continue

    return {"enabled": True, "status": "offline", "error": "agy language server not running"}


def check_codex(cfg):
    codex_cfg = cfg.get("providers", {}).get("codex", {})
    if not codex_cfg.get("enabled", True):
        return {"enabled": False, "status": "disabled"}

    auth_path = Path(codex_cfg.get("auth_file") or (Path.home() / ".codex" / "auth.json"))
    if not auth_path.exists():
        return {"enabled": True, "status": "not_configured", "error": "No ~/.codex/auth.json"}

    try:
        with open(auth_path) as f:
            auth = json.load(f)
        token = auth.get("tokens", {}).get("access_token")
        acct = auth.get("tokens", {}).get("account_id")
        if not token:
            return {"enabled": True, "status": "not_logged_in", "error": "No access token"}

        url = "https://chatgpt.com/backend-api/wham/usage"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "ChatGPT-Account-Id": acct or "",
                "User-Agent": "codex_cli_rs"
            }
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            rate_limit = data.get("rate_limit", {})
            p_win = rate_limit.get("primary_window", {})
            s_win = rate_limit.get("secondary_window", {})

            p_reset_ms = (p_win.get("reset_at") * 1000) if p_win.get("reset_at") else None
            s_reset_ms = (s_win.get("reset_at") * 1000) if s_win.get("reset_at") else None

            p_used = p_win.get("used_percent")
            s_used = s_win.get("used_percent")

            return {
                "enabled": True,
                "status": "ok",
                "plan": data.get("plan_type", "Standard"),
                "primary_window": {
                    "used_pct": p_used,
                    "remaining_pct": (100 - p_used) if p_used is not None else None,
                    "bar": make_ascii_bar(p_used),
                    "countdown": format_countdown_ms(p_reset_ms),
                    "reset_time": format_local_time_ms(p_reset_ms)
                },
                "secondary_window": {
                    "used_pct": s_used,
                    "remaining_pct": (100 - s_used) if s_used is not None else None,
                    "bar": make_ascii_bar(s_used),
                    "countdown": format_countdown_ms(s_reset_ms),
                    "reset_time": format_local_time_ms(s_reset_ms)
                }
            }
    except urllib.error.HTTPError as he:
        if he.code == 402:
            return {"enabled": True, "status": "payment_required", "error": "Payment Required (Plan inactive)"}
        elif he.code == 401:
            return {"enabled": True, "status": "auth_expired", "error": "Token expired"}
        return {"enabled": True, "status": "error", "error": f"HTTP {he.code}"}
    except Exception as e:
        return {"enabled": True, "status": "error", "error": str(e)}


def check_9router(cfg):
    r_cfg = cfg.get("providers", {}).get("nine_router", {})
    if not r_cfg.get("enabled", True):
        return {"enabled": False, "status": "disabled"}

    result = {
        "enabled": True,
        "status": "ok",
        "local_running": False,
        "remote_running": False,
        "today_requests": 0,
        "today_tokens": 0,
        "provider_count": 0
    }

    db_path = Path.home() / ".9router" / "db" / "data.sqlite"
    if db_path.exists():
        try:
            import sqlite3
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute('SELECT count(*), coalesce(sum(promptTokens + completionTokens), 0) FROM usageHistory WHERE date(timestamp) = date("now");')
            cnt, tokens = cur.fetchone()
            result["today_requests"] = cnt
            result["today_tokens"] = tokens
            cur.execute('SELECT count(*) FROM providerConnections WHERE isActive = 1;')
            result["provider_count"] = cur.fetchone()[0]
            conn.close()
        except Exception:
            pass

    base_url = r_cfg.get("base_url", "http://localhost:20128").rstrip("/")
    try:
        with urllib.request.urlopen(f"{base_url}/api/health", timeout=2) as resp:
            if resp.status == 200:
                result["local_running"] = True
    except Exception:
        result["local_running"] = False

    remote_url = r_cfg.get("remote_url", "").rstrip("/")
    if remote_url:
        try:
            with urllib.request.urlopen(f"{remote_url}/api/health", timeout=3) as resp:
                if resp.status == 200:
                    result["remote_running"] = True
                    result["remote_url"] = remote_url
        except Exception:
            result["remote_running"] = False

    return result


def check_omniroute(cfg):
    om_cfg = cfg.get("providers", {}).get("omniroute", {})
    if not om_cfg.get("enabled", True):
        return {"enabled": False, "status": "disabled"}

    base_url = om_cfg.get("base_url", "http://localhost:20128").rstrip("/")
    result = {
        "enabled": True,
        "status": "offline",
        "url": base_url
    }

    try:
        req = urllib.request.Request(f"{base_url}/v1/models", headers={"User-Agent": "aiacctool-monitor"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode())
            result["status"] = "ok"
            result["models_count"] = len(data.get("data", []))
    except Exception:
        result["status"] = "offline"

    return result


def check_openrouter(cfg):
    or_cfg = cfg.get("providers", {}).get("openrouter", {})
    if not or_cfg.get("enabled", False):
        return {"enabled": False, "status": "disabled"}

    key = or_cfg.get("api_key") or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        return {"enabled": True, "status": "not_configured", "error": "No OpenRouter API key"}

    try:
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/auth/key",
            headers={"Authorization": f"Bearer {key}", "User-Agent": "aiacctool-monitor"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode()).get("data", {})
            limit = data.get("limit")
            usage = data.get("usage")
            return {
                "enabled": True,
                "status": "ok",
                "label": data.get("label", "Key"),
                "usage_usd": usage,
                "limit_usd": limit,
                "is_free_tier": data.get("is_free_tier", False)
            }
    except Exception as e:
        return {"enabled": True, "status": "error", "error": str(e)}


def check_custom_apis(cfg):
    items = cfg.get("custom_apis", [])
    results = []
    for c in items:
        if not c.get("enabled", False) or not c.get("url"):
            continue
        try:
            req = urllib.request.Request(
                c["url"],
                headers=c.get("headers", {}),
                method=c.get("method", "GET").upper()
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode())
                def extract(path):
                    curr = data
                    for part in path.split("."):
                        if isinstance(curr, dict):
                            curr = curr.get(part)
                        else:
                            return None
                    return curr

                pct = extract(c.get("used_pct_path", "used_percent"))
                rst = extract(c.get("reset_path", "reset_at"))
                results.append({
                    "name": c.get("name", "Custom API"),
                    "status": "ok",
                    "used_pct": pct,
                    "bar": make_ascii_bar(pct),
                    "countdown": format_countdown_iso(str(rst)) if rst else ""
                })
        except Exception as e:
            results.append({
                "name": c.get("name", "Custom API"),
                "status": "error",
                "error": str(e)
            })
    return results


def generate_panel_summary(results, cfg, theme):
    """
    Generates a concise label and status icon for the GNOME top bar, styled according to the active theme.
    """
    p_format = cfg.get("panel_format", "compact")
    show_reset = cfg.get("show_reset_in_topbar", True)
    badges = theme.get("badge_icons", {})

    b_glm = badges.get("glm", "⚡")
    b_ag = badges.get("antigravity", "🌌")
    b_codex = badges.get("codex", "🤖")
    b_router = badges.get("nine_router", "🔀")
    b_rst = badges.get("reset", "⏳")

    parts = []
    has_warning = False
    has_ok = False

    # 1. GLM
    glm = results.get("glm", {})
    if glm.get("enabled") and glm.get("status") == "ok":
        has_ok = True
        tok = glm.get("token_quota", {})
        used = tok.get("used_pct")
        cd = tok.get("countdown")
        if used is not None:
            if used >= 90:
                has_warning = True
            if p_format == "compact":
                parts.append(f"{b_glm}{used}%" + (f"({cd})" if (used >= 90 and cd) else ""))
            elif p_format == "standard":
                parts.append(f"GLM {used}%" + (f" ({cd})" if (used >= 90 and cd) else ""))
            elif p_format == "full":
                parts.append(f"GLM: {used}% used")

    # 2. Antigravity
    ag = results.get("antigravity", {})
    if ag.get("enabled") and ag.get("status") == "ok":
        has_ok = True
        claude = ag.get("claude_sonnet", {})
        rem = claude.get("remaining_pct")
        cd = claude.get("countdown")
        if rem is not None:
            if rem <= 20:
                has_warning = True
            if p_format == "compact":
                ag_str = f"{b_ag}{rem:.0f}%"
                if show_reset and cd:
                    ag_str += f"{b_rst}{cd}"
                parts.append(ag_str)
            elif p_format == "standard":
                parts.append(f"AG {rem:.0f}%" + (f" {b_rst}{cd}" if (show_reset and cd) else ""))
            elif p_format == "full":
                parts.append(f"AG: {rem:.0f}% left")

    # 3. Codex
    codex = results.get("codex", {})
    if codex.get("enabled"):
        if codex.get("status") == "ok":
            has_ok = True
            p = codex.get("primary_window", {})
            u = p.get("used_pct")
            if u is not None:
                parts.append(f"{b_codex}{u}%" if p_format == "compact" else f"Codex {u}%")
        elif codex.get("status") == "payment_required":
            if p_format == "full":
                parts.append("Codex: Plan Inactive")

    # 4. 9Router Indicator
    r9 = results.get("nine_router", {})
    if r9.get("enabled") and (r9.get("remote_running") or r9.get("local_running")):
        has_ok = True

    badge_text = "  ".join(parts) if parts else ("AI Monitor" if has_ok else "AI Offline")

    # Determine icon name based on theme and health
    icon = theme.get("icon_warn") if has_warning else (theme.get("icon_ok") if has_ok else theme.get("icon_err"))

    return {
        "text": badge_text,
        "icon": icon,
        "show_icon": cfg.get("show_icon", True),
        "has_warning": has_warning,
        "has_ok": has_ok
    }


def collect_all():
    cfg = load_config()
    theme = get_active_theme(cfg)
    data = {
        "timestamp": int(time.time()),
        "time_str": datetime.datetime.now().strftime("%H:%M:%S"),
        "theme": theme,
        "available_themes": list(THEME_PRESETS.keys()),
        "glm": check_glm(cfg),
        "antigravity": check_antigravity(cfg),
        "codex": check_codex(cfg),
        "nine_router": check_9router(cfg),
        "omniroute": check_omniroute(cfg),
        "openrouter": check_openrouter(cfg),
        "custom_apis": check_custom_apis(cfg)
    }
    data["summary"] = generate_panel_summary(data, cfg, theme)
    return data


def set_theme(theme_name):
    if theme_name not in THEME_PRESETS:
        return False, f"Unknown theme '{theme_name}'. Available: {', '.join(THEME_PRESETS.keys())}"
    cfg = load_config()
    cfg["theme"] = theme_name
    save_config(cfg)
    return True, f"Theme set to '{theme_name}' ({THEME_PRESETS[theme_name]['name']})"


def main():
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "--config":
            print(json.dumps(load_config(), indent=2))
            return
        elif cmd == "--summary":
            d = collect_all()
            print(d["summary"]["text"])
            return
        elif cmd == "--set-theme" and len(sys.argv) > 2:
            ok, msg = set_theme(sys.argv[2])
            print(msg)
            sys.exit(0 if ok else 1)

    data = collect_all()
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
