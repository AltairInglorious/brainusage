import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {createScheduler} from './lib/core/scheduler.js';
import {createThresholdNotifier} from './lib/core/notifications.js';
import {createClaudeProvider} from './lib/providers/claude.js';
import {createCodexProvider} from './lib/providers/codex.js';
import {readTextFile} from './lib/runtime/fs.js';
import {fetch} from './lib/runtime/fetch.js';
import {buildUsageViewModel} from './lib/ui/render.js';

const UsageIndicator = GObject.registerClass(
class UsageIndicator extends PanelMenu.Button {
    _init(onRefresh) {
        super._init(0.0, 'Usage Indicator');

        this._label = new St.Label({
            text: '--',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this._label);

        this._claudeSessionItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._claudeWeeklyItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._codexSessionItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._codexWeeklyItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._claudeStatusItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._codexStatusItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._lastUpdateItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._refreshItem = new PopupMenu.PopupMenuItem('Refresh');

        this.menu.addMenuItem(this._claudeSessionItem);
        this.menu.addMenuItem(this._claudeWeeklyItem);
        this.menu.addMenuItem(this._codexSessionItem);
        this.menu.addMenuItem(this._codexWeeklyItem);
        this.menu.addMenuItem(this._claudeStatusItem);
        this.menu.addMenuItem(this._codexStatusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this._lastUpdateItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this._refreshItem);

        this._refreshSignalId = this._refreshItem.connect('activate', () => {
            if (typeof onRefresh === 'function')
                onRefresh();
        });

        this.render(null);
    }

    render(summary) {
        const viewModel = buildUsageViewModel(summary);

        this._label.text = viewModel.panelLabel;
        this._claudeSessionItem.label.text = viewModel.claudeSession;
        this._claudeWeeklyItem.label.text = viewModel.claudeWeekly;
        this._codexSessionItem.label.text = viewModel.codexSession;
        this._codexWeeklyItem.label.text = viewModel.codexWeekly;
        this._claudeStatusItem.label.text = viewModel.claudeStatus;
        this._codexStatusItem.label.text = viewModel.codexStatus;
        this._lastUpdateItem.label.text = viewModel.lastUpdate;
    }

    destroy() {
        if (this._refreshSignalId) {
            this._refreshItem.disconnect(this._refreshSignalId);
            this._refreshSignalId = null;
        }

        super.destroy();
    }
});

export default class UsageLimitsExtension extends Extension {
    enable() {
        const fetchImpl = fetch;
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

        this._indicator = new UsageIndicator(() => {
            void this._scheduler?.refresh();
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._scheduler.start();
    }

    disable() {
        this._scheduler?.stop();
        this._scheduler = null;
        this._thresholdNotifier = null;

        if (!this._indicator)
            return;

        this._indicator.destroy();
        this._indicator = null;
    }
}
