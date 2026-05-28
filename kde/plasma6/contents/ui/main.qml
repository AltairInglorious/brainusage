import QtQuick 2.15
import QtQuick.Layouts 1.15
import QtQuick.Controls 2.15 as QQC2

import org.kde.plasma.plasmoid
import org.kde.kirigami as Kirigami

import "../code/runtime.js" as Runtime
import "../code/brainusage-app.mjs" as App

PlasmoidItem {
    id: root

    property var appInstance: null
    property var vm: null
    property string panelLabel: "--"

    toolTipMainText: i18n("Brain Usage")
    toolTipSubText: root.panelLabel

    function rebuild() {
        if (!root.appInstance)
            return;
        var model = root.appInstance.viewModel(Plasmoid.configuration.panelLabelMode);
        root.vm = model;
        root.panelLabel = model.panelLabel;
    }

    function pollNow() {
        if (root.appInstance)
            root.appInstance.refresh();
    }

    ExecReader { id: reader }

    // Notifications are created lazily so a missing org.kde.notification module
    // degrades gracefully (the widget still loads) instead of failing to import.
    property var _notifier: null
    function notify(title, body) {
        if (root._notifier === null) {
            try {
                root._notifier = Qt.createQmlObject(
                    'import QtQuick 2.15; import org.kde.notification 1.0;'
                    + ' Notification { componentName: "plasma_workspace"; eventId: "notification" }',
                    root);
            } catch (e1) {
                try {
                    root._notifier = Qt.createQmlObject(
                        'import QtQuick 2.15; import org.kde.notification;'
                        + ' Notification { componentName: "plasma_workspace"; eventId: "notification" }',
                        root);
                } catch (e2) {
                    root._notifier = false; // unavailable; stop trying
                }
            }
        }
        if (root._notifier) {
            root._notifier.title = title;
            root._notifier.text = body;
            root._notifier.sendEvent();
        }
    }

    Component.onCompleted: {
        reader.resolveHome().then(function (homeDir) {
            root.appInstance = App.createApp({
                fetchImpl: Runtime.xhrFetch,
                readTextFile: function (p) { return reader.readFile(p); },
                homeDir: homeDir,
                notify: function (t, b) { root.notify(t, b); },
                onUpdate: function () { root.rebuild(); }
            });
            root.rebuild();
            root.pollNow();
        });
    }

    Timer {
        interval: App.DEFAULT_POLL_INTERVAL_MS
        running: true
        repeat: true
        onTriggered: root.pollNow()
    }

    Timer {
        interval: 60000
        running: true
        repeat: true
        onTriggered: root.rebuild()
    }

    Connections {
        target: Plasmoid.configuration
        function onPanelLabelModeChanged() { root.rebuild(); }
    }

    compactRepresentation: MouseArea {
        Layout.minimumWidth: panelText.implicitWidth + Kirigami.Units.smallSpacing * 2
        onClicked: root.expanded = !root.expanded

        Text {
            id: panelText
            anchors.centerIn: parent
            text: root.panelLabel
            color: Kirigami.Theme.textColor
            font.pixelSize: Math.round(parent.height * 0.5)
            font.bold: true
        }
    }

    fullRepresentation: Item {
        Layout.minimumWidth: Kirigami.Units.gridUnit * 18
        Layout.preferredWidth: Kirigami.Units.gridUnit * 18
        Layout.minimumHeight: Kirigami.Units.gridUnit * 16

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 12
            spacing: 12

            Repeater {
                model: root.vm ? root.vm.services : []
                delegate: ServiceCard {
                    Layout.fillWidth: true
                    service: modelData
                }
            }

            Rectangle {
                Layout.fillWidth: true
                height: 1
                color: Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.1)
            }

            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: root.vm ? root.vm.version : "brainusage"
                    font.pixelSize: 11
                    color: Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.5)
                }
                Item { Layout.fillWidth: true }
                Text {
                    text: root.vm ? root.vm.lastUpdate : "Next update in --"
                    font.pixelSize: 11
                    color: Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.5)
                }
            }

            QQC2.Button {
                Layout.alignment: Qt.AlignRight
                text: i18n("Refresh")
                icon.name: "view-refresh"
                onClicked: root.pollNow()
            }

            Item { Layout.fillHeight: true }
        }
    }
}
