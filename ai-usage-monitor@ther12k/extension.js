import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

const AIIndicator = GObject.registerClass(
class AIIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, _('AI Usage Monitor'));
        this._extension = extension;
        this._collectorScript = GLib.build_filenamev([this._extension.path, 'ai-collector.py']);
        this._lastData = null;

        // Main panel horizontal layout
        this._box = new St.BoxLayout({
            style_class: 'ai-monitor-panel-box panel-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._icon = new St.Icon({
            icon_name: 'emblem-default-symbolic',
            style_class: 'system-status-icon ai-monitor-icon',
        });
        this._box.add_child(this._icon);

        // Structured badge chips: per-account colored % + horizontal mini bar
        this._chipsBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
        this._chipsBox.hide();
        this._box.add_child(this._chipsBox);

        this._label = new St.Label({
            text: _('AI: ...'),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'ai-monitor-label',
        });
        this._box.add_child(this._label);

        this.add_child(this._box);

        // Build Dropdown Menu
        this._buildMenu();

        // Live countdown state (ticked every second)
        this._chips = [];          // menu countdown chips
        this._tooltipAccounts = []; // GLM accounts shown in the panel tooltip
        this._alertState = null;   // last seen alert snapshot

        // Start Periodic Polling (every 30 seconds)
        this._pollTimerId = null;
        this._refreshData();
        this._startPolling(30);
        this._startTicker();
    }

    _startTicker() {
        if (this._tickId)
            GLib.source_remove(this._tickId);
        // Keep live countdowns (tooltip + open menu chips) ticking every second
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateChips();
            this._updateTooltip();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _fmtCountdown(ms, compact = false) {
        if (ms === null || ms === undefined)
            return '';
        const diff = Math.max(0, Math.floor(ms - Date.now()));
        if (diff <= 1000)
            return 'Resetting';
        const h = Math.floor(diff / 3.6e6);
        const m = Math.floor((diff % 3.6e6) / 6e4);
        const s = Math.floor((diff % 6e4) / 1e3);
        if (h > 0)
            return compact ? `${h}h${m}m` : `${h}h ${m}m`;
        if (m > 0)
            return compact ? `${m}m${s}s` : `${m}m ${s}s`;
        return `${s}s`;
    }

    _isoToMs(iso) {
        if (!iso)
            return null;
        const t = Date.parse(iso);
        return isNaN(t) ? null : t;
    }

    _renderBadge() {
        const d = this._lastData;
        const s = (d && d.summary) || {};
        const fmt = (d && d.ui_options && d.ui_options.panel_format) || 'compact';
        const accounts = s.panel_accounts || [];
        const useChips = accounts.length > 0 && fmt !== 'minimal';

        this._tooltipAccounts = useChips ? accounts : [];

        if (!useChips) {
            // Fallback: single text label (minimal format, no GLM data, offline)
            this._chipsBox.hide();
            this._label.show();
            let text = s.template || s.text || '';
            if (s.template && s.template_vars) {
                for (const [k, ms] of Object.entries(s.template_vars))
                    text = text.split(`{${k}}`).join(this._fmtCountdown(ms, true));
            }
            this._label.text = text || _('AI Monitor');
            this._updateTooltip();
            return;
        }

        const theme = d.theme || {};
        const T = {
            ok: theme.menu_ok_color || '#81c995',
            warn: theme.menu_warn_color || '#fdd663',
            err: theme.menu_err_color || '#f28b82',
            muted: theme.menu_muted_color || '#9aa0a6',
        };
        const th = this._thresholds();
        const bGlm = (theme.badge_icons && theme.badge_icons.glm) || '✦';
        let baseFont = '';
        if (theme.topbar_font_weight)
            baseFont += `font-weight: ${theme.topbar_font_weight}; `;
        if (theme.topbar_font_size)
            baseFont += `font-size: ${theme.topbar_font_size}; `;
        if (theme.topbar_font_family)
            baseFont += `font-family: ${theme.topbar_font_family}; `;

        this._label.hide();
        this._chipsBox.show();
        this._chipsBox.destroy_all_children();

        const segs = [];
        accounts.forEach((a, i) => {
            const pct = Math.round(a.used_pct);
            const exhausted = a.used_pct >= th.exhaust;
            // Per-account text color; exhausted accounts always flash the error color
            const color = exhausted ? T.err : this._accountColor(i);
            const tag = s.show_short !== false && a.short ? `${a.short} ` : '';
            const chip = new St.BoxLayout({
                y_align: Clutter.ActorAlign.CENTER,
                style: 'spacing: 4px;',
            });
            chip.add_child(new St.Label({
                text: `${bGlm}${tag}${pct}%`,
                y_align: Clutter.ActorAlign.CENTER,
                style: `${baseFont}color: ${color};`,
            }));
            chip.add_child(this._miniBar(pct, this._usedColor(pct, T)));
            if (fmt === 'full' && a.reset_ms)
                chip.add_child(new St.Label({
                    text: this._fmtCountdown(a.reset_ms, true),
                    y_align: Clutter.ActorAlign.CENTER,
                    style: `${baseFont}color: ${T.muted}; font-size: 10px;`,
                }));
            segs.push(chip);
        });

        const groupText = s.panel_group && s.panel_group.text;
        if (groupText)
            segs.push(new St.Label({
                text: groupText,
                y_align: Clutter.ActorAlign.CENTER,
                style: `${baseFont}${theme.topbar_color ? `color: ${theme.topbar_color};` : ''}`,
            }));

        segs.forEach((w, i) => {
            if (i > 0)
                this._chipsBox.add_child(new St.Label({
                    text: '·',
                    y_align: Clutter.ActorAlign.CENTER,
                    style: `color: ${T.muted};`,
                }));
            this._chipsBox.add_child(w);
        });
        this._updateTooltip();
    }

    _miniBar(pct, color, width = 32) {
        const track = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style: `width: ${width}px; height: 4px; border-radius: 2px;` +
                ` background-color: rgba(255, 255, 255, 0.16);`,
        });
        const clamped = Math.max(0, Math.min(100, pct));
        const w = clamped > 0 ? Math.max(2, Math.round(width * clamped / 100)) : 0;
        if (w > 0)
            track.add_child(new St.BoxLayout({
                style: `width: ${w}px; height: 4px; border-radius: 2px; background-color: ${color};`,
            }));
        return track;
    }

    _accountColor(i) {
        const opts = (this._lastData && this._lastData.ui_options) || {};
        const custom = opts.account_colors || [];
        if (custom[i])
            return custom[i];
        const palette = ['#59a7ff', '#ffb454', '#7ee787', '#d2a8ff', '#ff7b72', '#56d4dd'];
        return palette[i % palette.length];
    }

    _updateTooltip() {
        const lines = (this._tooltipAccounts || []).map(a =>
            `GLM ${a.name}: ${Math.round(a.used_pct)}% used · resets in ${this._fmtCountdown(a.reset_ms)}` +
            `${a.reset_time ? ` (${a.reset_time})` : ''}`);
        const s = (this._lastData && this._lastData.summary) || {};
        if (!lines.length && s.text)
            lines.push(s.text);
        this.tooltip_text = lines.join('\n') || null;
    }

    _updateChips() {
        for (const c of this._chips || []) {
            const ms = c.iso ? this._isoToMs(c.iso) : c.ms;
            c.label.text = `⏳ ${this._fmtCountdown(ms)}`;
        }
    }

    _buildMenu() {
        this.menu.removeAll();

        // Header Title
        const headerItem = new PopupMenu.PopupMenuItem(_('AI Account & Quota Monitor'), {
            reactive: false,
            style_class: 'ai-monitor-header',
        });
        this.menu.addMenuItem(headerItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Dynamic content container
        this._contentSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._contentSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Theme / Appearance Submenu
        this._themeSubMenu = new PopupMenu.PopupSubMenuMenuItem(_('🎨  Theme & Presets'));
        this._populateThemes();
        this.menu.addMenuItem(this._themeSubMenu);

        // Settings submenu (live, no external editor needed)
        this._settingsSubMenu = new PopupMenu.PopupSubMenuMenuItem(_('⚙️  Settings'));
        this._populateSettings();
        this.menu.addMenuItem(this._settingsSubMenu);

        // Actions
        const refreshItem = new PopupMenu.PopupMenuItem(_('🔄  Refresh Now'));
        refreshItem.connect('activate', () => {
            this._refreshData();
        });
        this.menu.addMenuItem(refreshItem);

        const open9RouterItem = new PopupMenu.PopupMenuItem(_('🌐  Open 9Router Dashboard'));
        open9RouterItem.connect('activate', () => {
            const url = (this._lastData && this._lastData.nine_router && this._lastData.nine_router.remote_url)
                ? this._lastData.nine_router.remote_url
                : 'http://localhost:20128/dashboard';
            Util.spawnCommandLine(`xdg-open "${url}"`);
        });
        this.menu.addMenuItem(open9RouterItem);

        const openZaiItem = new PopupMenu.PopupMenuItem(_('⚡  Open Z.ai Console'));
        openZaiItem.connect('activate', () => {
            Util.spawnCommandLine('xdg-open https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys');
        });
        this.menu.addMenuItem(openZaiItem);

        const editConfigItem = new PopupMenu.PopupMenuItem(_('📝  Edit config.json (Text Editor)'));
        editConfigItem.connect('activate', () => {
            const cfgPath = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'ai-usage-monitor', 'config.json']);
            // xdg-open would route .json to the web browser; spawn a real editor instead
            Util.spawnCommandLine(`gnome-text-editor "${cfgPath}" || gedit "${cfgPath}" || xdg-open "${cfgPath}"`);
        });
        this.menu.addMenuItem(editConfigItem);
    }

    _populateSettings() {
        if (!this._settingsSubMenu)
            return;
        this._settingsSubMenu.menu.removeAll();

        const opts = (this._lastData && this._lastData.ui_options) || {};

        // Boolean switches
        const iconSwitch = new PopupMenu.PopupSwitchMenuItem(_('Show status icon'), !!opts.show_icon);
        iconSwitch.connect('toggled', (item, state) => {
            this._setOption('show_icon', state);
        });
        this._settingsSubMenu.menu.addMenuItem(iconSwitch);

        const resetSwitch = new PopupMenu.PopupSwitchMenuItem(_('Reset countdown (tooltip + full format)'), !!opts.show_reset_in_topbar);
        resetSwitch.connect('toggled', (item, state) => {
            this._setOption('show_reset_in_topbar', state);
        });
        this._settingsSubMenu.menu.addMenuItem(resetSwitch);

        const alertSwitch = new PopupMenu.PopupSwitchMenuItem(_('Quota alerts (notifications)'), opts.show_alerts !== false);
        alertSwitch.connect('toggled', (item, state) => {
            this._setOption('show_alerts', state);
        });
        this._settingsSubMenu.menu.addMenuItem(alertSwitch);

        this._settingsSubMenu.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Cycling options
        const fmtItem = new PopupMenu.PopupMenuItem(`Badge format: ${opts.panel_format || 'compact'}   (click to change)`);
        fmtItem.connect('activate', () => {
            this._cycleOption('panel_format', ['compact', 'standard', 'full', 'minimal']);
        });
        this._settingsSubMenu.menu.addMenuItem(fmtItem);

        const posItem = new PopupMenu.PopupMenuItem(`Panel position: ${opts.panel_position || 'center'}   (click to change)`);
        posItem.connect('activate', () => {
            this._cycleOption('panel_position', ['center', 'left', 'right']);
        });
        this._settingsSubMenu.menu.addMenuItem(posItem);

        const intItem = new PopupMenu.PopupMenuItem(`Refresh every: ${opts.poll_interval_sec || 30}s   (click to change)`);
        intItem.connect('activate', () => {
            this._cycleOption('poll_interval_sec', ['15', '30', '60', '120']);
        });
        this._settingsSubMenu.menu.addMenuItem(intItem);
    }

    _setOption(key, value) {
        try {
            const proc = new Gio.Subprocess({
                argv: ['python3', this._collectorScript, '--set-option', key, String(value)],
                flags: Gio.SubprocessFlags.STDOUT_PIPE,
            });
            proc.init(null);
            proc.communicate_utf8_async(null, null, (obj, res) => {
                this._refreshData();
            });
        } catch (e) {
            log(`[AI Monitor] Error setting option ${key}: ${e}`);
        }
    }

    _cycleOption(key, values) {
        const opts = (this._lastData && this._lastData.ui_options) || {};
        const current = String(opts[key] !== undefined ? opts[key] : values[0]);
        const idx = values.indexOf(current);
        const next = values[(idx + 1) % values.length];
        this._setOption(key, next);
    }

    _repositionIndicator() {
        const opts = (this._lastData && this._lastData.ui_options) || {};
        const pos = opts.panel_position || 'center';
        const boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };
        const target = boxes[pos] || Main.panel._centerBox;
        const parent = this.container.get_parent();
        if (parent === target)
            return;
        if (parent)
            parent.remove_child(this.container);
        target.insert_child_at_index(this.container, pos === 'center' ? 0 : 1);
    }

    _populateThemes() {
        this._themeSubMenu.menu.removeAll();
        const themes = [
            { id: 'default', name: 'Default Cyber' },
            { id: 'catppuccin', name: 'Catppuccin Mocha' },
            { id: 'nord', name: 'Nord Frost' },
            { id: 'dracula', name: 'Dracula Vampire' },
            { id: 'cyberpunk', name: 'Cyberpunk Neon' },
            { id: 'monochrome', name: 'Minimal Monochrome' },
        ];

        const theme = (this._lastData && this._lastData.theme) || {};
        const currentThemeId = theme.theme_id || 'default';

        for (const t of themes) {
            const item = new PopupMenu.PopupMenuItem('');
            const prefix = currentThemeId === t.id ? '● ' : '○ ';
            item.label.text = `${prefix}${t.name}`;
            // Color the marker with the preset's signature color
            const presetColor = {
                default: '#8ab4f8', catppuccin: '#cba6f7', nord: '#88c0d0',
                dracula: '#bd93f9', cyberpunk: '#00ffcc', monochrome: '#ffffff',
            }[t.id];
            item.label.set_style(currentThemeId === t.id
                ? `color: ${presetColor}; font-weight: bold;`
                : `color: ${presetColor}99;`);
            item.connect('activate', () => {
                this._setTheme(t.id);
            });
            this._themeSubMenu.menu.addMenuItem(item);
        }
    }

    _setTheme(themeId) {
        try {
            const proc = new Gio.Subprocess({
                argv: ['python3', this._collectorScript, '--set-theme', themeId],
                flags: Gio.SubprocessFlags.STDOUT_PIPE,
            });
            proc.init(null);
            proc.communicate_utf8_async(null, null, (obj, res) => {
                this._refreshData();
            });
            this.menu.open(); // keep menu open while the theme applies
        } catch (e) {
            log(`[AI Monitor] Error switching theme: ${e}`);
        }
    }

    _toggleProvider(routerType, providerName) {
        try {
            const proc = new Gio.Subprocess({
                argv: ['python3', this._collectorScript, '--toggle-provider', routerType, providerName],
                flags: Gio.SubprocessFlags.STDOUT_PIPE,
            });
            proc.init(null);
            proc.communicate_utf8_async(null, null, (obj, res) => {
                this._refreshData();
            });
            this.menu.open(); // keep menu open for rapid multi-toggle
        } catch (e) {
            log(`[AI Monitor] Error toggling provider: ${e}`);
        }
    }

    _startPolling(seconds) {
        if (this._pollTimerId) {
            GLib.source_remove(this._pollTimerId);
            this._pollTimerId = null;
        }
        this._currentPollInterval = seconds;
        this._pollTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._refreshData();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _refreshData() {
        try {
            const proc = new Gio.Subprocess({
                argv: ['python3', this._collectorScript],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });

            proc.init(null);
            proc.communicate_utf8_async(null, null, (obj, res) => {
                try {
                    const [ok, stdout, stderr] = proc.communicate_utf8_finish(res);
                    if (ok && stdout) {
                        const data = JSON.parse(stdout);
                        this._updateUI(data);
                    } else {
                        log(`[AI Monitor] Collector failed: ${stderr}`);
                    }
                } catch (e) {
                    log(`[AI Monitor] Error parsing collector response: ${e}`);
                }
            });
        } catch (e) {
            log(`[AI Monitor] Error spawning collector: ${e}`);
        }
    }

    _updateUI(data) {
        this._lastData = data;
        const theme = data.theme || {};
        const summary = data.summary || {};

        // 1. Update Top Bar Label & Style (live countdowns re-render every second)
        this._renderBadge();

        // Apply theme font, size, weight, and color
        let styleStr = '';
        if (theme.topbar_color) {
            styleStr += `color: ${theme.topbar_color}; `;
        }
        if (theme.topbar_font_weight) {
            styleStr += `font-weight: ${theme.topbar_font_weight}; `;
        }
        if (theme.topbar_font_size) {
            styleStr += `font-size: ${theme.topbar_font_size}; `;
        }
        if (theme.topbar_font_family) {
            styleStr += `font-family: ${theme.topbar_font_family}; `;
        }
        this._label.set_style(styleStr);

        // 2. Update Icon & Visibility
        if (summary.show_icon !== false) {
            this._icon.visible = true;
            const logoPath = GLib.build_filenamev([this._extension.path, 'zhipu-logo.png']);
            const hasLogo = GLib.file_test(logoPath, GLib.FileTest.EXISTS);

            if (!summary.has_ok) {
                // Everything offline: keep the offline symbolic icon
                this._icon.gicon = null;
                this._icon.icon_name = summary.icon || 'network-offline-symbolic';
                this._icon.set_style('');
            } else if (summary.has_warning) {
                // Warning state stays highly visible with the symbolic icon
                this._icon.gicon = null;
                this._icon.icon_name = summary.icon || 'dialog-warning-symbolic';
                this._icon.set_style('');
            } else if (hasLogo) {
                // Healthy: show the Zhipu AI (Z.ai) brand logo
                this._icon.icon_name = null;
                this._icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(logoPath));
                this._icon.set_style('icon-size: 16px;');
            } else {
                this._icon.gicon = null;
                this._icon.icon_name = summary.icon || 'emblem-default-symbolic';
                this._icon.set_style('');
            }
        } else {
            this._icon.visible = false;
        }

        // 3. Refresh Theme & Settings SubMenu choices
        this._populateThemes();
        this._populateSettings();
        this._repositionIndicator();

        // 3b. Restart polling if the interval changed
        const opts = data.ui_options || {};
        const wantedInterval = parseInt(opts.poll_interval_sec, 10) || 30;
        if (wantedInterval !== this._currentPollInterval) {
            this._currentPollInterval = wantedInterval;
            this._startPolling(wantedInterval);
        }

        // 4. Re-populate Menu Content Section
        this._contentSection.removeAll();
        this._chips = [];

        const T = {
            ok: theme.menu_ok_color || '#81c995',
            warn: theme.menu_warn_color || '#fdd663',
            err: theme.menu_err_color || '#f28b82',
            muted: theme.menu_muted_color || '#9aa0a6',
            accent: theme.menu_section_color || '#8ab4f8',
        };

        // Small helpers used while rendering rows
        const sum = (arr, fn) => arr.reduce((acc, v) => acc + (fn ? fn(v) : v), 0);
        const fmtInt = n => (n || 0).toLocaleString('en-US');

        // Compact status line under the header
        const onlineBits = [];
        const glmOk = ((data.glm || {}).accounts || []).filter(a => a.status === 'ok').length;
        if (glmOk)
            onlineBits.push(`GLM ${glmOk}/${((data.glm || {}).accounts || []).length}`);
        if ((data.antigravity || {}).status === 'ok')
            onlineBits.push('Antigravity');
        if ((data.codex || {}).status === 'ok')
            onlineBits.push('Codex');
        const r9 = data.nine_router || {};
        if (r9.enabled && (r9.remote_running || r9.local_running)) {
            const up = sum(Object.values(r9.filtered_providers || {}), p => p.active_count || 0);
            onlineBits.push(`9Router ${up}↑`);
        }
        const statusLine = onlineBits.length > 0
            ? `● ${onlineBits.join('  ·  ')}`
            : '○ All providers offline';
        const statusRow = new PopupMenu.PopupMenuItem(statusLine, {
            reactive: false,
            style_class: 'ai-monitor-val-muted',
        });
        statusRow.label.set_style(onlineBits.length ? `color: ${T.ok};` : `color: ${T.muted};`);
        this._contentSection.addMenuItem(statusRow);

        // ==================== GLM Section ====================
        const glm = data.glm || {};
        if (glm.enabled) {
            const accounts = glm.accounts && glm.accounts.length > 0
                ? glm.accounts
                : [{name: 'main', status: glm.status, token_quota: glm.token_quota, tool_quota: glm.tool_quota, error: glm.error}];

            const th = this._thresholds();
            const exhausted = accounts.filter(a => a.status === 'ok' && (a.token_quota || {}).used_pct >= th.exhaust).length;
            this._addSectionTitle(this._contentSection, theme, '✦ GLM (Zhipu)', `${accounts.length} account${accounts.length > 1 ? 's' : ''}${exhausted ? ` · ${exhausted} exhausted` : ''}`);

            for (const acc of accounts) {
                if (acc.status === 'ok') {
                    const tok = acc.token_quota || {};
                    this._addQuotaRow(this._contentSection, theme, {
                        name: acc.name,
                        usedPct: tok.used_pct,
                        countdown: tok.countdown, resetMs: tok.reset_ms,
                        resetTime: tok.reset_time,
                        sub: this._toolLine(acc.tool_quota),
                    });
                } else {
                    this._addStatusRow(this._contentSection, theme, {
                        name: acc.name,
                        text: acc.error || acc.status,
                        kind: 'err',
                    });
                }
            }
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== Antigravity Section ====================
        const ag = data.antigravity || {};
        if (ag.enabled) {
            if (ag.status === 'ok') {
                const agSub = new PopupMenu.PopupSubMenuMenuItem('');
                this._styleSubmenuHeader(agSub, '🌌 Antigravity', this._pctText((ag.gemini || {}).remaining_pct, true), theme);
                const sonnet = ag.claude_sonnet || {};
                const gemini = ag.gemini || {};
                this._addQuotaRow(agSub.menu, theme, {
                    name: 'Claude Sonnet', usedPct: sonnet.used_pct,
                    countdown: sonnet.countdown, resetTime: sonnet.reset_time, resetIso: sonnet.reset_iso, invert: true,
                });
                this._addQuotaRow(agSub.menu, theme, {
                    name: 'Gemini', usedPct: gemini.used_pct,
                    countdown: gemini.countdown, resetTime: gemini.reset_time, resetIso: gemini.reset_iso, invert: true,
                });
                if (ag.models && Object.keys(ag.models).length > 0) {
                    const modelsSub = new PopupMenu.PopupSubMenuMenuItem(`All models (${ag.models_count})`);
                    for (const [mName, mInfo] of Object.entries(ag.models)) {
                        const rem = mInfo.remaining_pct;
                        const cd = mInfo.countdown && mInfo.countdown !== 'Ready' ? ` · ${mInfo.countdown}` : '';
                        const mRow = new PopupMenu.PopupMenuItem(
                            `${mName}  ${rem !== null && rem !== undefined ? rem.toFixed(0) + '%' : ''}${cd}`,
                            { reactive: false, style_class: 'ai-monitor-item' }
                        );
                        mRow.label.set_style(`color: ${this._remColor(rem, T)};`);
                        modelsSub.menu.addMenuItem(mRow);
                    }
                    agSub.menu.addMenuItem(modelsSub);
                }
                this._contentSection.addMenuItem(agSub);
            } else {
                this._addStatusRow(this._contentSection, theme, {
                    name: '🌌 Antigravity',
                    text: ag.error || 'Offline',
                    kind: 'muted',
                });
            }
        }

        // ==================== Codex Section ====================
        const codex = data.codex || {};
        if (codex.enabled) {
            if (codex.status === 'ok') {
                const p = codex.primary_window || {};
                const s = codex.secondary_window || {};
                const cdSub = new PopupMenu.PopupSubMenuMenuItem('');
                this._styleSubmenuHeader(cdSub, '🤖 Codex', this._pctText(p.used_pct), theme);
                this._addQuotaRow(cdSub.menu, theme, {
                    name: '5-hour window', usedPct: p.used_pct,
                    countdown: p.countdown, resetTime: p.reset_time, resetMs: p.reset_ms,
                });
                this._addQuotaRow(cdSub.menu, theme, {
                    name: 'Weekly', usedPct: s.used_pct,
                    countdown: s.countdown, resetTime: s.reset_time, resetMs: s.reset_ms,
                });
                this._contentSection.addMenuItem(cdSub);
            } else {
                this._addStatusRow(this._contentSection, theme, {
                    name: '🤖 Codex',
                    text: codex.status === 'payment_required' ? 'Plan inactive' : (codex.error || codex.status),
                    kind: 'warn',
                });
            }
        }

        // ==================== 9Router Section ====================
        if (r9.enabled) {
            const up = sum(Object.values(r9.filtered_providers || {}), p => p.active_count || 0);
            const total = Object.keys(r9.all_providers || {}).length;
            const r9Sub = new PopupMenu.PopupSubMenuMenuItem('');
            this._styleSubmenuHeader(
                r9Sub, '🔀 9Router',
                r9.remote_running || r9.local_running
                    ? `<span foreground="${T.ok}">${up}↑</span> of ${total}`
                    : 'offline',
                theme
            );

            const srvRow = new PopupMenu.PopupMenuItem(
                `${r9.remote_running ? 'Remote' : 'Local'} gateway online · today ${fmtInt(r9.today_requests)} req / ${fmtInt(r9.today_tokens)} tok`,
                { reactive: false, style_class: 'ai-monitor-item' }
            );
            r9Sub.menu.addMenuItem(srvRow);
            r9Sub.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const hint = new PopupMenu.PopupMenuItem('Click a provider to (de)select it for monitoring:', {
                reactive: false, style_class: 'ai-monitor-val-muted',
            });
            r9Sub.menu.addMenuItem(hint);

            for (const [pName, pInfo] of Object.entries(r9.all_providers || {})) {
                const monitored = Boolean((r9.filtered_providers || {})[pName]);
                const act = pInfo.active_count || 0;
                const tot = pInfo.count || 0;
                const mark = monitored ? '☑' : '☐';
                const mItem = new PopupMenu.PopupMenuItem('');
                const leftBox = new St.BoxLayout({ vertical: true, x_expand: true });
                const nameRow = new St.Label({ text: `${mark} ${pName}` });
                leftBox.add_child(nameRow);
                const details = pInfo.accounts_detail || [];
                const badAccounts = details.filter(a => !a.active || a.error);
                if (badAccounts.length > 0 && details.length <= 4) {
                    for (const a of badAccounts.slice(0, 2)) {
                        const errLine = a.error ? ` — ${a.error.split('\n')[0].slice(0, 48)}` : '';
                        const dLbl = new St.Label({ text: `    ${a.active ? '●' : '○'} ${a.name}${errLine}` });
                        dLbl.set_style(`color: ${a.active ? T.warn : T.err}; font-size: 10.5px;`);
                        leftBox.add_child(dLbl);
                    }
                }
                const right = new St.Label({ text: `${act}/${tot}` });
                right.set_style(`color: ${act > 0 ? T.ok : T.err};`);
                right.y_align = Clutter.ActorAlign.CENTER;
                mItem.add_child(leftBox);
                mItem.add_child(right);
                mItem.connect('activate', () => this._toggleProvider('9router', pName));
                r9Sub.menu.addMenuItem(mItem);
            }
            this._contentSection.addMenuItem(r9Sub);
        }

        // ==================== OmniRoute Section ====================
        const om = data.omniroute || {};
        if (om.enabled) {
            if (om.status === 'ok') {
                const omSub = new PopupMenu.PopupSubMenuMenuItem('');
                this._styleSubmenuHeader(omSub, '🔄 OmniRoute', `${om.models_count} models`, theme);
                for (const [pName, count] of Object.entries(om.filtered_providers || {})) {
                    const row = new PopupMenu.PopupMenuItem(`${pName}: ${count} models`, { reactive: false, style_class: 'ai-monitor-item' });
                    omSub.menu.addMenuItem(row);
                }
                this._contentSection.addMenuItem(omSub);
            } else {
                this._addStatusRow(this._contentSection, theme, {
                    name: '🔄 OmniRoute',
                    text: 'Offline',
                    kind: 'muted',
                });
            }
        }

        // ==================== OpenRouter Section ====================
        const or = data.openrouter || {};
        if (or.enabled && or.status !== 'disabled') {
            if (or.status === 'ok') {
                let right;
                if (or.limit_usd !== null && or.limit_usd !== undefined) {
                    const pctLeft = or.limit_usd > 0 ? ((or.limit_usd - (or.usage_usd || 0)) / or.limit_usd) * 100 : 100;
                    right = `<span foreground="${this._remColor(pctLeft, T)}">$${(or.usage_usd || 0).toFixed(2)} / $${or.limit_usd.toFixed(2)}</span>`;
                } else {
                    right = `<span foreground="${T.ok}">$${(or.usage_usd || 0).toFixed(2)} used</span>`;
                }
                const orSub = new PopupMenu.PopupSubMenuMenuItem('');
                this._styleSubmenuHeader(orSub, '🌐 OpenRouter', right, theme);
                const lbl = new PopupMenu.PopupMenuItem(
                    `${or.label || 'Key'}${or.is_free_tier ? ' · free tier' : ' · pay-as-you-go'}`,
                    { reactive: false, style_class: 'ai-monitor-item' }
                );
                orSub.menu.addMenuItem(lbl);
                this._contentSection.addMenuItem(orSub);
            } else {
                this._addStatusRow(this._contentSection, theme, {
                    name: '🌐 OpenRouter',
                    text: or.error || or.status,
                    kind: or.status === 'not_configured' ? 'muted' : 'err',
                });
            }
        }

        // ==================== Custom APIs ====================
        for (const cust of data.custom_apis || []) {
            if (cust.status === 'ok') {
                this._addQuotaRow(this._contentSection, theme, {
                    name: cust.name, usedPct: cust.used_pct, countdown: cust.countdown,
                });
            } else {
                this._addStatusRow(this._contentSection, theme, {
                    name: cust.name, text: cust.error || 'Error', kind: 'err',
                });
            }
        }

        // 5. Threshold-crossing alerts (notifications)
        this._checkAlerts(data);
    }

    _checkAlerts(data) {
        if (!(data.ui_options || {}).show_alerts) {
            this._alertState = null;
            return;
        }
        const snap = this._snapshotAlerts(data);
        if (!this._alertState) {
            this._alertState = snap;  // seed silently on first poll
            return;
        }
        const headlines = [];
        const details = [];
        for (const [key, state] of Object.entries(snap)) {
            const prev = this._alertState[key];
            if (prev === state)
                continue;
            const name = key.split(':', 2)[1];
            if (state === 'exhausted') {
                headlines.push(`\u2726 ${name} quota exhausted`);
                const ms = (this._alertTimers || {})[key];
                if (ms)
                    details.push(`${name} resets in ${this._fmtCountdown(ms)}`);
            } else if (state === 'ok' && prev === 'exhausted') {
                headlines.push(`\u2726 ${name} quota restored`);
            } else if (state === 'offline' && prev === 'ok') {
                headlines.push(`${name} went offline`);
            } else if (state === 'payment' && prev === 'ok') {
                headlines.push('Codex plan inactive');
            }
        }
        this._alertState = snap;
        if (headlines.length > 0) {
            const title = headlines.length === 1 ? headlines[0] : `${headlines.length} quota events`;
            const body = headlines.join('\n') + (details.length ? '\n' + details.join('\n') : '');
            try {
                Main.notify(`AI Monitor \u2014 ${title}`, body);
            } catch (e) {
                log(`[AI Monitor] notify failed: ${e}`);
            }
        }
    }

    _snapshotAlerts(data) {
        const snap = {};
        const timers = {};
        for (const acc of ((data.glm || {}).accounts || [])) {
            if (acc.status !== 'ok')
                continue;
            const tok = acc.token_quota || {};
            if (tok.used_pct === null || tok.used_pct === undefined)
                continue;
            snap[`glm:${acc.name}`] = tok.used_pct >= this._thresholds().exhaust ? 'exhausted' : 'ok';
            timers[`glm:${acc.name}`] = tok.reset_ms;
        }
        const ag = data.antigravity || {};
        if (ag.enabled)
            snap['agy:Antigravity'] = ag.status === 'ok' ? 'ok' : 'offline';
        const codex = data.codex || {};
        if (codex.enabled) {
            if (codex.status === 'ok')
                snap['codex:Codex'] = 'ok';
            else if (codex.status === 'payment_required')
                snap['codex:Codex'] = 'payment';
        }
        this._alertTimers = timers;
        return snap;
    }

    /* ---------- row-building helpers ---------- */

    _addSectionTitle(section, theme, text, summary) {
        const row = new PopupMenu.PopupBaseMenuItem({ reactive: false, style_class: 'ai-sec' });
        const title = new St.Label({ text });
        title.set_style(`color: ${theme.menu_section_color || '#8ab4f8'}; font-weight: bold; font-size: 12px;`);
        const right = summary ? new St.Label({ text: summary }) : null;
        if (right)
            right.set_style(`color: ${theme.menu_muted_color || '#9aa0a6'}; font-size: 11px;`);
        this._rowTwoSides(row, title, right);
        section.addMenuItem(row);
    }

    _addQuotaRow(section, theme, opts) {
        // opts: { name, usedPct, countdown, resetTime, resetMs, resetIso, sub, invert }
        // invert=true when usedPct actually holds a REMAINING percentage
        const T = {
            ok: theme.menu_ok_color || '#81c995',
            warn: theme.menu_warn_color || '#fdd663',
            err: theme.menu_err_color || '#f28b82',
            muted: theme.menu_muted_color || '#9aa0a6',
        };
        const row = new PopupMenu.PopupBaseMenuItem({ reactive: false, style_class: 'ai-row' });

        const leftBox = new St.BoxLayout({ vertical: true, x_expand: true });
        const nameLbl = new St.Label({ text: opts.name });
        nameLbl.set_style('font-size: 12px;');
        leftBox.add_child(nameLbl);
        if (opts.sub) {
            const subLbl = new St.Label({ text: opts.sub });
            subLbl.set_style(`color: ${T.muted}; font-size: 10.5px;`);
            leftBox.add_child(subLbl);
        }

        const rightBox = new St.BoxLayout({ style: 'spacing: 8px;', y_align: Clutter.ActorAlign.CENTER });
        const pct = opts.usedPct;
        if (pct !== null && pct !== undefined) {
            rightBox.add_child(this._barWidget(pct, T, opts.invert));
            const valColor = opts.invert ? this._remColor(pct, T) : this._usedColor(pct, T);
            const val = new St.Label({ text: `${Math.round(pct)}%` });
            val.set_style(`color: ${valColor}; font-weight: bold; font-size: 12px;`);
            rightBox.add_child(val);
        }
        const liveMs = opts.resetMs !== null && opts.resetMs !== undefined
            ? opts.resetMs
            : (opts.resetIso ? this._isoToMs(opts.resetIso) : null);
        if (opts.countdown || liveMs) {
            const chip = new St.Label({ text: `⏳ ${opts.countdown || ''}` });
            chip.set_style(`color: ${T.muted}; font-size: 11px;`);
            rightBox.add_child(chip);
            if (liveMs)
                this._chips.push({ label: chip, ms: liveMs, iso: opts.resetIso || null });
        }

        row.add_child(leftBox);
        row.add_child(rightBox);
        section.addMenuItem(row);
    }

    _addStatusRow(section, theme, opts) {
        // opts: { name, text, kind: ok|warn|err|muted }
        const T = {
            ok: theme.menu_ok_color || '#81c995',
            warn: theme.menu_warn_color || '#fdd663',
            err: theme.menu_err_color || '#f28b82',
            muted: theme.menu_muted_color || '#9aa0a6',
        };
        const row = new PopupMenu.PopupBaseMenuItem({ reactive: false, style_class: 'ai-row' });
        const left = new St.Label({ text: opts.name });
        left.set_style('font-size: 12px;');
        const right = new St.Label({ text: opts.text });
        right.set_style(`color: ${T[opts.kind] || T.muted}; font-size: 11.5px;`);
        this._rowTwoSides(row, left, right);
        section.addMenuItem(row);
    }

    _barWidget(pct, T, invert = false) {
        // Slim horizontal bar: fill color follows threshold semantics
        const width = 72;
        const box = new St.BoxLayout({ style_class: 'ai-bar' });
        const val = Math.max(0, Math.min(100, pct));
        const fillW = Math.round((val / 100) * width);
        const color = invert ? this._remColor(val, T) : this._usedColor(val, T);
        const fill = new St.BoxLayout({
            style: `width: ${fillW}px; background-color: ${color}; margin: 3px 0; border-radius: 2px;`,
        });
        const rest = new St.BoxLayout({
            style: `width: ${width - fillW}px; background-color: rgba(255,255,255,0.14); margin: 3px 0; border-radius: 2px;`,
        });
        box.add_child(fill);
        box.add_child(rest);
        return box;
    }

    _rowTwoSides(row, left, right) {
        if (left) {
            left.x_expand = true;
            row.add_child(left);
        }
        if (right) {
            right.y_align = Clutter.ActorAlign.CENTER;
            row.add_child(right);
        }
    }

    _styleSubmenuHeader(sub, title, rightTextOrMarkup, theme) {
        // PopupSubMenuMenuItem renders its label; restyle it and add a right-side summary
        sub.label.text = title;
        sub.label.set_style('font-weight: bold; font-size: 12px;');
        if (rightTextOrMarkup) {
            const right = new St.Label({});
            // Pango markup passthrough when the caller sends <span .../>
            if (rightTextOrMarkup.includes('<'))
                right.clutter_text.set_markup(rightTextOrMarkup);
            else
                right.text = rightTextOrMarkup;
            right.y_align = Clutter.ActorAlign.CENTER;
            sub.add_child(right);
        }
    }

    _thresholds() {
        const o = (this._lastData && this._lastData.ui_options) || {};
        return {
            warn: o.alert_warn_pct !== undefined ? o.alert_warn_pct : 85,
            exhaust: o.alert_exhaust_pct !== undefined ? o.alert_exhaust_pct : 95,
        };
    }

    _usedColor(pct, T) {
        const th = this._thresholds();
        if (pct >= th.exhaust) return T.err;
        if (pct >= th.warn - 15) return T.warn;
        return T.ok;
    }

    _remColor(pct, T) {
        const th = this._thresholds();
        if (pct <= 100 - th.exhaust) return T.err;
        if (pct <= 100 - th.warn + 15) return T.warn;
        return T.ok;
    }

    _pctText(pct, remaining = false) {
        return pct !== null && pct !== undefined ? `${Math.round(pct)}%${remaining ? ' left' : ''}` : '—';
    }

    _toolLine(tool) {
        if (!tool || tool.remaining === null || tool.remaining === undefined)
            return null;
        return `tools ${tool.current || 0}/${(tool.current || 0) + tool.remaining} used`;
    }

    destroy() {
        if (this._pollTimerId) {
            GLib.source_remove(this._pollTimerId);
            this._pollTimerId = null;
        }
        if (this._tickId) {
            GLib.source_remove(this._tickId);
            this._tickId = null;
        }
        super.destroy();
    }
});

export default class AIUsageMonitorExtension extends Extension {
    enable() {
        this._indicator = new AIIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'center');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
