import QtQuick 2.15
import QtQuick.Controls 2.15 as QQC2
import org.kde.kirigami 2.5 as Kirigami

Kirigami.FormLayout {
    id: page

    // Two-way bound by the Plasma config framework via the cfg_<key> convention.
    property string cfg_panelLabelMode: "min"

    QQC2.ComboBox {
        id: modeCombo
        Kirigami.FormData.label: i18n("Panel label:")
        textRole: "text"
        valueRole: "value"
        model: [
            {value: "min", text: i18n("All (minimum)")},
            {value: "claude-session", text: i18n("Claude Session")},
            {value: "claude-weekly", text: i18n("Claude Weekly")},
            {value: "codex-session", text: i18n("Codex Session")},
            {value: "codex-weekly", text: i18n("Codex Weekly")}
        ]
        onActivated: page.cfg_panelLabelMode = currentValue
        Component.onCompleted: currentIndex = indexOfValue(page.cfg_panelLabelMode)
    }
}
