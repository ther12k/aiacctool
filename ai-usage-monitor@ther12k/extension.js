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

        // Main panel horizontal layout
        this._box = new St.BoxLayout({
            style_class: 'ai-monitor-panel-box',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._icon = new St.Icon({
            icon_name: 'emblem-default-symbolic',
            style_class: 'system-status-icon ai-monitor-icon',
        });
        this._box.add_child(this._icon);

        this._label = new St.Label({
            text: _('AI: ...'),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'ai-monitor-label',
        });
        this._box.add_child(this._label);

        this.add_child(this._box);

        // Build Dropdown Menu
        this._buildMenu();

        // Start Periodic Polling (every 30 seconds)
        this._pollTimerId = null;
        this._refreshData();
        this._startPolling(30);
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

        const editConfigItem = new PopupMenu.PopupMenuItem(_('⚙️  Edit Configuration'));
        editConfigItem.connect('activate', () => {
            const cfgPath = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'ai-usage-monitor', 'config.json']);
            Util.spawnCommandLine(`xdg-open "${cfgPath}"`);
        });
        this.menu.addMenuItem(editConfigItem);
    }

    _startPolling(seconds) {
        if (this._pollTimerId) {
            GLib.source_remove(this._pollTimerId);
            this._pollTimerId = null;
        }
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
        // 1. Update Top Bar Label & Icon
        const summary = data.summary || {};
        this._label.text = summary.text || _('AI Monitor');

        if (summary.has_warning) {
            this._icon.icon_name = 'dialog-warning-symbolic';
        } else if (summary.has_ok) {
            this._icon.icon_name = 'emblem-default-symbolic';
        } else {
            this._icon.icon_name = 'network-offline-symbolic';
        }

        // 2. Re-populate Menu Section
        this._contentSection.removeAll();

        // Subtitle / Last updated
        if (data.time_str) {
            const timeItem = new PopupMenu.PopupMenuItem(
                `Last sync: ${data.time_str}`,
                { reactive: false, style_class: 'ai-monitor-val-muted' }
            );
            this._contentSection.addMenuItem(timeItem);
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== GLM Section ====================
        const glm = data.glm || {};
        if (glm.enabled) {
            const title = new PopupMenu.PopupMenuItem(_('⚡ GLM (Z.ai / BigModel)'), {
                reactive: false,
                style_class: 'ai-monitor-section-title',
            });
            this._contentSection.addMenuItem(title);

            if (glm.status === 'ok') {
                const tok = glm.token_quota || {};
                const tokUsed = tok.used_pct !== null && tok.used_pct !== undefined ? `${tok.used_pct}%` : '0%';
                const tokBar = tok.bar ? ` [${tok.bar}]` : '';
                const tokCd = tok.countdown ? ` · Reset: ${tok.countdown}` : '';
                const tokItem = new PopupMenu.PopupMenuItem(
                    `  Tokens: ${tokUsed} used${tokBar}${tokCd}`,
                    { reactive: false, style_class: 'ai-monitor-item' }
                );
                this._contentSection.addMenuItem(tokItem);

                const tool = glm.tool_quota || {};
                if (tool.remaining !== null && tool.remaining !== undefined) {
                    const toolCd = tool.countdown ? ` · Reset: ${tool.countdown}` : '';
                    const toolItem = new PopupMenu.PopupMenuItem(
                        `  Web Search / Tools: ${tool.current || 0} used / ${tool.remaining} left${toolCd}`,
                        { reactive: false, style_class: 'ai-monitor-item' }
                    );
                    this._contentSection.addMenuItem(toolItem);
                }
            } else {
                const errItem = new PopupMenu.PopupMenuItem(
                    `  Status: ${glm.error || glm.status}`,
                    { reactive: false, style_class: 'ai-monitor-item ai-monitor-val-err' }
                );
                this._contentSection.addMenuItem(errItem);
            }
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== Google Antigravity Section ====================
        const ag = data.antigravity || {};
        if (ag.enabled) {
            const title = new PopupMenu.PopupMenuItem(_('🌌 Google Antigravity (agy)'), {
                reactive: false,
                style_class: 'ai-monitor-section-title',
            });
            this._contentSection.addMenuItem(title);

            if (ag.status === 'ok') {
                const sonnet = ag.claude_sonnet || {};
                const sonnetRem = sonnet.remaining_pct !== null && sonnet.remaining_pct !== undefined ? `${sonnet.remaining_pct}%` : 'N/A';
                const sonnetBar = sonnet.bar ? ` [${sonnet.bar}]` : '';
                const sonnetCd = sonnet.countdown ? ` · Reset: ${sonnet.countdown} (${sonnet.reset_time})` : '';
                const sonnetItem = new PopupMenu.PopupMenuItem(
                    `  Claude Sonnet: ${sonnetRem} left${sonnetBar}${sonnetCd}`,
                    { reactive: false, style_class: 'ai-monitor-item' }
                );
                this._contentSection.addMenuItem(sonnetItem);

                const gemini = ag.gemini || {};
                const geminiRem = gemini.remaining_pct !== null && gemini.remaining_pct !== undefined ? `${gemini.remaining_pct}%` : 'N/A';
                const geminiBar = gemini.bar ? ` [${gemini.bar}]` : '';
                const geminiCd = gemini.countdown ? ` · Reset: ${gemini.countdown} (${gemini.reset_time})` : '';
                const geminiItem = new PopupMenu.PopupMenuItem(
                    `  Gemini 3.8: ${geminiRem} left${geminiBar}${geminiCd}`,
                    { reactive: false, style_class: 'ai-monitor-item' }
                );
                this._contentSection.addMenuItem(geminiItem);

                // Submenu for all models
                if (ag.models && Object.keys(ag.models).length > 0) {
                    const subMenu = new PopupMenu.PopupSubMenuMenuItem(`  All Models Quota (${ag.models_count})`);
                    for (const [mName, mInfo] of Object.entries(ag.models)) {
                        const rem = mInfo.remaining_pct !== null ? `${mInfo.remaining_pct}%` : '';
                        const cd = mInfo.countdown && mInfo.countdown !== 'Ready' ? ` (${mInfo.countdown})` : '';
                        const mItem = new PopupMenu.PopupMenuItem(
                            `${mName}: ${rem} left${cd}`,
                            { reactive: false }
                        );
                        subMenu.menu.addMenuItem(mItem);
                    }
                    this._contentSection.addMenuItem(subMenu);
                }

                const portItem = new PopupMenu.PopupMenuItem(
                    `  Server: Local Port ${ag.port} Active`,
                    { reactive: false, style_class: 'ai-monitor-item ai-monitor-val-muted' }
                );
                this._contentSection.addMenuItem(portItem);
            } else {
                const offItem = new PopupMenu.PopupMenuItem(
                    `  Status: ${ag.error || 'Offline'}`,
                    { reactive: false, style_class: 'ai-monitor-item ai-monitor-val-muted' }
                );
                this._contentSection.addMenuItem(offItem);
            }
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== OpenAI Codex Section ====================
        const codex = data.codex || {};
        if (codex.enabled) {
            const title = new PopupMenu.PopupMenuItem(_('🤖 OpenAI Codex'), {
                reactive: false,
                style_class: 'ai-monitor-section-title',
            });
            this._contentSection.addMenuItem(title);

            if (codex.status === 'ok') {
                const p = codex.primary_window || {};
                const pUsed = p.used_pct !== null && p.used_pct !== undefined ? `${p.used_pct}%` : '0%';
                const pBar = p.bar ? ` [${p.bar}]` : '';
                const pCd = p.countdown ? ` · Reset: ${p.countdown}` : '';
                const pItem = new PopupMenu.PopupMenuItem(
                    `  5h Window: ${pUsed} used${pBar}${pCd}`,
                    { reactive: false, style_class: 'ai-monitor-item' }
                );
                this._contentSection.addMenuItem(pItem);

                const s = codex.secondary_window || {};
                const sUsed = s.used_pct !== null && s.used_pct !== undefined ? `${s.used_pct}%` : '0%';
                const sBar = s.bar ? ` [${s.bar}]` : '';
                const sCd = s.countdown ? ` · Reset: ${s.countdown}` : '';
                const sItem = new PopupMenu.PopupMenuItem(
                    `  Weekly: ${sUsed} used${sBar}${sCd}`,
                    { reactive: false, style_class: 'ai-monitor-item' }
                );
                this._contentSection.addMenuItem(sItem);
            } else {
                const statMsg = codex.status === 'payment_required'
                    ? 'Payment Required (Plan inactive)'
                    : (codex.error || codex.status);
                const errItem = new PopupMenu.PopupMenuItem(
                    `  Status: ${statMsg}`,
                    { reactive: false, style_class: 'ai-monitor-item ai-monitor-val-warn' }
                );
                this._contentSection.addMenuItem(errItem);
            }
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== 9Router Section ====================
        const r9 = data.nine_router || {};
        if (r9.enabled) {
            const title = new PopupMenu.PopupMenuItem(_('🔀 9Router'), {
                reactive: false,
                style_class: 'ai-monitor-section-title',
            });
            this._contentSection.addMenuItem(title);

            const srvText = r9.remote_running ? 'Remote: Online' : (r9.local_running ? 'Local: Online' : 'Offline');
            const srvItem = new PopupMenu.PopupMenuItem(
                `  Server: ${srvText}`,
                { reactive: false, style_class: 'ai-monitor-item' }
            );
            this._contentSection.addMenuItem(srvItem);

            const usageItem = new PopupMenu.PopupMenuItem(
                `  Today: ${r9.today_requests} requests · ${r9.today_tokens} tokens`,
                { reactive: false, style_class: 'ai-monitor-item' }
            );
            this._contentSection.addMenuItem(usageItem);
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== OmniRoute Section ====================
        const om = data.omniroute || {};
        if (om.enabled) {
            const title = new PopupMenu.PopupMenuItem(_('🔄 OmniRoute'), {
                reactive: false,
                style_class: 'ai-monitor-section-title',
            });
            this._contentSection.addMenuItem(title);

            const omStatus = om.status === 'ok' ? `Connected (${om.models_count} models)` : 'Offline (port 20128)';
            const omItem = new PopupMenu.PopupMenuItem(
                `  Status: ${omStatus}`,
                { reactive: false, style_class: 'ai-monitor-item' }
            );
            this._contentSection.addMenuItem(omItem);
            this._contentSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // ==================== Custom APIs ====================
        const customList = data.custom_apis || [];
        if (customList.length > 0) {
            for (const cust of customList) {
                const title = new PopupMenu.PopupMenuItem(`📡 ${cust.name}`, {
                    reactive: false,
                    style_class: 'ai-monitor-section-title',
                });
                this._contentSection.addMenuItem(title);

                if (cust.status === 'ok') {
                    const u = cust.used_pct !== null && cust.used_pct !== undefined ? `${cust.used_pct}%` : 'N/A';
                    const bar = cust.bar ? ` [${cust.bar}]` : '';
                    const cd = cust.countdown ? ` · Reset: ${cust.countdown}` : '';
                    const item = new PopupMenu.PopupMenuItem(
                        `  Usage: ${u}${bar}${cd}`,
                        { reactive: false, style_class: 'ai-monitor-item' }
                    );
                    this._contentSection.addMenuItem(item);
                } else {
                    const errItem = new PopupMenu.PopupMenuItem(
                        `  Status: ${cust.error || 'Error'}`,
                        { reactive: false, style_class: 'ai-monitor-item ai-monitor-val-err' }
                    );
                    this._contentSection.addMenuItem(errItem);
                }
            }
        }
    }

    destroy() {
        if (this._pollTimerId) {
            GLib.source_remove(this._pollTimerId);
            this._pollTimerId = null;
        }
        super.destroy();
    }
});

export default class AIUsageMonitorExtension extends Extension {
    enable() {
        this._indicator = new AIIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
