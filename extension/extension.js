import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {createScheduler, DEFAULT_POLL_INTERVAL_MS} from './lib/core/scheduler.js';
import {createThresholdNotifier} from './lib/core/notifications.js';
import {createClaudeProvider} from './lib/providers/claude.js';
import {createCodexProvider} from './lib/providers/codex.js';
import {readTextFile} from './lib/runtime/fs.js';
import {createFetch} from './lib/runtime/fetch.js';
import {
    buildUsageViewModel,
    PANEL_DISPLAY_MODES,
    PANEL_PERCENT_MODES,
} from './lib/ui/render.js';

const FILL_CLASSES = {
    green: 'usage-fill-green',
    yellow: 'usage-fill-yellow',
    red: 'usage-fill-red',
};

function getProviderStyleClass(baseClass, providerKey) {
    const classes = [baseClass];

    if (providerKey === 'claude')
        classes.push('usage-provider-claude');
    else if (providerKey === 'codex')
        classes.push('usage-provider-codex');

    return classes.join(' ');
}

function setProviderStyleClass(actor, baseClass, providerKey) {
    actor.style_class = getProviderStyleClass(baseClass, providerKey);
}

function loadProviderIcons(extensionPath) {
    return {
        codex: new Gio.FileIcon({
            file: Gio.File.new_for_path(
                GLib.build_filenamev([extensionPath, 'assets', 'codex-symbolic.svg']),
            ),
        }),
        claude: new Gio.FileIcon({
            file: Gio.File.new_for_path(
                GLib.build_filenamev([extensionPath, 'assets', 'claude-symbolic.svg']),
            ),
        }),
    };
}

function getStatusAreaActor(actorOrButton) {
    if (!actorOrButton)
        return null;

    if (typeof actorOrButton.get_parent === 'function')
        return actorOrButton;

    if (actorOrButton.container && typeof actorOrButton.container.get_parent === 'function')
        return actorOrButton.container;

    return null;
}

function pinIndicatorNearQuickSettings(indicator) {
    const rightBox = Main.panel?._rightBox ?? null;
    const indicatorActor = getStatusAreaActor(indicator);

    if (!rightBox || !indicatorActor || indicatorActor.get_parent() !== rightBox)
        return;

    const quickSettingsActor = getStatusAreaActor(Main.panel.statusArea.quickSettings);
    if (quickSettingsActor && quickSettingsActor.get_parent() === rightBox) {
        rightBox.set_child_below_sibling(indicatorActor, quickSettingsActor);
        return;
    }

    const childCount = rightBox.get_n_children();
    if (childCount > 0)
        rightBox.set_child_at_index(indicatorActor, childCount - 1);
}

function createWindowWidgets() {
    const box = new St.BoxLayout({
        vertical: true,
        style_class: 'usage-window-row',
    });

    const label = new St.Label({style_class: 'usage-window-label'});

    const track = new St.BoxLayout({style_class: 'usage-progress-track'});
    track.set_x_expand(true);
    const fill = new St.Widget({style_class: 'usage-fill-green'});
    fill._remainingPct = 0;
    track.add_child(fill);

    track.connect('notify::allocation', () => {
        const node = track.get_theme_node();
        if (!node) return;
        const contentBox = node.get_content_box(track.get_allocation_box());
        const contentWidth = contentBox.x2 - contentBox.x1;
        if (contentWidth > 0)
            fill.set_width(Math.round(contentWidth * fill._remainingPct / 100));
    });

    const infoRow = new St.BoxLayout({style_class: 'usage-info-row'});
    infoRow.set_x_expand(true);
    const remainingLabel = new St.Label({text: '-- left'});
    const resetsLabel = new St.Label({text: '--'});
    const spacer = new St.Widget();
    spacer.set_x_expand(true);
    infoRow.add_child(remainingLabel);
    infoRow.add_child(spacer);
    infoRow.add_child(resetsLabel);

    box.add_child(label);
    box.add_child(track);
    box.add_child(infoRow);

    return {box, label, track, fill, remainingLabel, resetsLabel};
}

function createServiceSection(providerKey, providerIcon) {
    const container = new St.BoxLayout({vertical: true, style_class: 'usage-service-card'});

    const header = new St.BoxLayout({style_class: 'usage-service-header'});
    const icon = new St.Icon({
        gicon: providerIcon,
        icon_size: 16,
    });
    setProviderStyleClass(icon, 'usage-service-icon', providerKey);
    const nameLabel = new St.Label();
    setProviderStyleClass(nameLabel, 'usage-service-name', providerKey);
    header.add_child(icon);
    header.add_child(nameLabel);

    const window0 = createWindowWidgets();
    const window1 = createWindowWidgets();

    const warningLabel = new St.Label({style_class: 'usage-warning'});
    warningLabel.hide();

    container.add_child(header);
    container.add_child(window0.box);
    container.add_child(window1.box);
    container.add_child(warningLabel);

    return {container, icon, nameLabel, windows: [window0, window1], warningLabel};
}

const MODE_LABELS = {
    'codex-session': 'Codex Session',
    'codex-weekly': 'Codex Week',
    'claude-session': 'Claude Session',
    'claude-weekly': 'Claude Week',
};

const PERCENT_MODE_LABELS = {
    left: 'Left',
    used: 'Used',
};

function clearChildren(actor) {
    for (const child of actor.get_children())
        child.destroy();
}

function createPanelMetricWidget(providerKey, metric) {
    const box = new St.BoxLayout({style_class: 'usage-panel-metric-box'});
    const contextLabel = new St.Label({
        text: metric.label,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const valueLabel = new St.Label({
        text: metric.percentText,
        y_align: Clutter.ActorAlign.CENTER,
    });

    setProviderStyleClass(contextLabel, 'usage-panel-context', providerKey);
    setProviderStyleClass(valueLabel, 'usage-panel-value', providerKey);

    box.add_child(contextLabel);
    box.add_child(valueLabel);

    return box;
}

function createPanelGroupWidget(providerKey, providerIcon, items) {
    const box = new St.BoxLayout({
        style_class: 'usage-panel-group',
        y_align: Clutter.ActorAlign.CENTER,
    });

    const icon = new St.Icon({
        gicon: providerIcon,
        icon_size: 14,
        y_align: Clutter.ActorAlign.CENTER,
    });
    setProviderStyleClass(icon, 'usage-panel-icon', providerKey);
    box.add_child(icon);

    for (const item of items)
        box.add_child(createPanelMetricWidget(providerKey, item));

    return box;
}

const UsageIndicator = GObject.registerClass(
class UsageIndicator extends PanelMenu.Button {
    _init(scheduler, settings, providerIcons) {
        super._init(0.0, 'Usage Indicator');

        this._scheduler = scheduler;
        this._settings = settings;
        this._providerIcons = providerIcons;
        this._lastSummary = null;
        this._timerSourceId = 0;
        this._displayModeItems = [];
        this._percentModeItems = [];
        this._settingsChangedIds = [];

        this._panelBox = new St.BoxLayout({
            style_class: 'usage-panel-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._panelPlaceholder = new St.Label({
            text: '--',
            style_class: 'usage-panel-value',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._panelBox.add_child(this._panelPlaceholder);
        this.add_child(this._panelBox);

        this._buildPopup();
        this._startRelativeTimeTimer();

        const onSettingsChanged = () => {
            this._updateOrnaments();
            this._refreshRelativeTimes();
        };

        this._settingsChangedIds = [
            this._settings.connect('changed::panel-display-modes', onSettingsChanged),
            this._settings.connect('changed::panel-percent-mode', onSettingsChanged),
        ];
    }

    _buildPopup() {
        const menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });

        this._popupBox = new St.BoxLayout({
            vertical: true,
            style_class: 'usage-popup-box',
        });

        this._codexSection = createServiceSection('codex', this._providerIcons.codex);
        this._codexSection.nameLabel.text = 'Codex';

        this._claudeSection = createServiceSection('claude', this._providerIcons.claude);
        this._claudeSection.nameLabel.text = 'Claude';

        const separator = new St.Widget({style_class: 'usage-separator'});
        separator.set_x_expand(true);

        const footerRow = new St.BoxLayout({style_class: 'usage-footer-row'});
        footerRow.set_x_expand(true);
        this._versionLabel = new St.Label({text: 'brainusage 0.0.1'});
        this._nextUpdateLabel = new St.Label({text: 'Next update in --'});
        const footerSpacer = new St.Widget();
        footerSpacer.set_x_expand(true);
        footerRow.add_child(this._versionLabel);
        footerRow.add_child(footerSpacer);
        footerRow.add_child(this._nextUpdateLabel);

        this._popupBox.add_child(this._codexSection.container);
        this._popupBox.add_child(this._claudeSection.container);
        this._popupBox.add_child(separator);
        this._popupBox.add_child(footerRow);

        menuItem.add_child(this._popupBox);
        this.menu.addMenuItem(menuItem);

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh');
        this._refreshSignalId = refreshItem.connect('activate', () => {
            void this._scheduler?.refresh();
        });
        this._refreshItem = refreshItem;
        this.menu.addMenuItem(refreshItem);

        this._buildDisplaySection();
        this._buildPercentSubmenu();
    }

    _buildDisplaySection() {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Panel display'));
        this._displayModeItems = [];

        for (const mode of PANEL_DISPLAY_MODES) {
            const item = new PopupMenu.PopupSwitchMenuItem(
                MODE_LABELS[mode] ?? mode,
                this._getPanelDisplayModes().includes(mode),
            );
            item._modeKey = mode;
            item.connect('toggled', (_item, state) => {
                this._setDisplayMode(mode, state);
            });
            this._displayModeItems.push(item);
            this.menu.addMenuItem(item);
        }

        this._updateOrnaments();
    }

    _updateOrnaments() {
        this._updateDisplayOrnaments();
        this._updatePercentModeOrnaments();
    }

    _updateDisplayOrnaments() {
        const current = new Set(this._getPanelDisplayModes());
        for (const item of this._displayModeItems) {
            const isEnabled = current.has(item._modeKey);
            if (item.state !== isEnabled)
                item.setToggleState(isEnabled);
        }
    }

    _getPanelDisplayModes() {
        const configured = this._settings.get_strv('panel-display-modes');
        const configuredSet = new Set(configured);
        return PANEL_DISPLAY_MODES.filter((mode) => configuredSet.has(mode));
    }

    _setDisplayMode(mode, enabled) {
        const current = new Set(this._getPanelDisplayModes());

        if (enabled)
            current.add(mode);
        else
            current.delete(mode);

        const next = PANEL_DISPLAY_MODES.filter((key) => current.has(key));
        this._settings.set_strv('panel-display-modes', next);
    }

    _buildPercentSubmenu() {
        this._percentSubmenu = new PopupMenu.PopupSubMenuMenuItem('Percent mode');
        this._percentModeItems = [];

        for (const mode of PANEL_PERCENT_MODES) {
            const item = new PopupMenu.PopupMenuItem(PERCENT_MODE_LABELS[mode] ?? mode);
            item._percentModeKey = mode;
            item.connect('activate', () => {
                this._settings.set_string('panel-percent-mode', mode);
            });
            this._percentModeItems.push(item);
            this._percentSubmenu.menu.addMenuItem(item);
        }

        this._updatePercentModeOrnaments();
        this.menu.addMenuItem(this._percentSubmenu);
    }

    _updatePercentModeOrnaments() {
        const current = this._settings.get_string('panel-percent-mode');
        for (const item of this._percentModeItems) {
            item.setOrnament(
                item._percentModeKey === current
                    ? PopupMenu.Ornament.DOT
                    : PopupMenu.Ornament.NONE,
            );
        }
    }

    _startRelativeTimeTimer() {
        this._timerSourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            60,
            () => {
                this._refreshRelativeTimes();
                return GLib.SOURCE_CONTINUE;
            },
        );
    }

    _refreshRelativeTimes() {
        if (!this._lastSummary)
            return;

        this._applyViewModel(buildUsageViewModel(this._lastSummary, {
            now: Date.now(),
            pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
            panelDisplayModes: this._getPanelDisplayModes(),
            panelPercentMode: this._settings.get_string('panel-percent-mode'),
        }));
    }

    render(summary) {
        this._lastSummary = summary;
        this._applyViewModel(buildUsageViewModel(summary, {
            now: Date.now(),
            pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
            panelDisplayModes: this._getPanelDisplayModes(),
            panelPercentMode: this._settings.get_string('panel-percent-mode'),
        }));
    }

    _applyViewModel(vm) {
        clearChildren(this._panelBox);

        if (vm.panelGroups.length > 0) {
            for (const group of vm.panelGroups) {
                this._panelBox.add_child(createPanelGroupWidget(
                    group.providerKey,
                    this._providerIcons[group.providerKey],
                    group.items,
                ));
            }
        } else {
            this._panelPlaceholder = new St.Label({
                text: '--',
                style_class: 'usage-panel-value',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._panelBox.add_child(this._panelPlaceholder);
        }

        const sections = [this._codexSection, this._claudeSection];

        for (let i = 0; i < vm.services.length; i++) {
            const svc = vm.services[i];
            const section = sections[i];

            section.nameLabel.text = svc.name;
            setProviderStyleClass(section.icon, 'usage-service-icon', svc.key);
            setProviderStyleClass(section.nameLabel, 'usage-service-name', svc.key);

            for (let j = 0; j < svc.windows.length; j++) {
                const w = svc.windows[j];
                const widgets = section.windows[j];

                widgets.label.text = w.label;
                widgets.fill.style_class = FILL_CLASSES[w.dotColor] ?? 'usage-fill-red';
                widgets.fill._remainingPct = w.remainingPct;
                widgets.remainingLabel.text = w.remainingText;
                widgets.resetsLabel.text = w.resetsInText;

                const node = widgets.track.get_theme_node();
                if (node) {
                    const contentBox = node.get_content_box(widgets.track.get_allocation_box());
                    const contentWidth = contentBox.x2 - contentBox.x1;
                    if (contentWidth > 0)
                        widgets.fill.set_width(Math.round(contentWidth * w.remainingPct / 100));
                }
            }

            if (svc.warning) {
                section.warningLabel.text = svc.warning;
                section.warningLabel.show();
            } else {
                section.warningLabel.hide();
            }
        }

        this._versionLabel.text = vm.version;
        this._nextUpdateLabel.text = vm.lastUpdate;
    }

    destroy() {
        if (this._timerSourceId) {
            GLib.source_remove(this._timerSourceId);
            this._timerSourceId = 0;
        }

        if (this._refreshSignalId && this._refreshItem) {
            this._refreshItem.disconnect(this._refreshSignalId);
            this._refreshSignalId = null;
        }

        if (this._settings && this._settingsChangedIds.length > 0) {
            for (const signalId of this._settingsChangedIds)
                this._settings.disconnect(signalId);
        }

        this._settingsChangedIds = [];
        this._settings = null;
        super.destroy();
    }
});

export default class UsageLimitsExtension extends Extension {
    enable() {
        this._fetchRuntime = createFetch();
        const fetchImpl = this._fetchRuntime.fetch;
        const fileReader = readTextFile;

        const claude = createClaudeProvider({
            fetch: fetchImpl,
            readTextFile: fileReader,
        });
        const codex = createCodexProvider({
            fetch: fetchImpl,
            readTextFile: fileReader,
        });
        this._thresholdNotifier = createThresholdNotifier({
            notifyFn: (title, body) => {
                Main.notify(title, body);
            },
        });

        this._scheduler = createScheduler({
            providers: {claude, codex},
            onUpdate: (summary) => {
                this._indicator?.render(summary);
                this._thresholdNotifier?.evaluate(summary);
            },
        });

        this._settings = this.getSettings();
        this._indicator = new UsageIndicator(
            this._scheduler,
            this._settings,
            loadProviderIcons(this.path),
        );
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        pinIndicatorNearQuickSettings(this._indicator);
        this._scheduler.start();
    }

    disable() {
        this._scheduler?.stop();
        this._scheduler = null;
        this._thresholdNotifier = null;

        this._fetchRuntime?.dispose();
        this._fetchRuntime = null;

        if (!this._indicator)
            return;

        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
