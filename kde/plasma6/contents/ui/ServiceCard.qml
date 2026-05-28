import QtQuick 2.15
import QtQuick.Layouts 1.15
import org.kde.kirigami as Kirigami

// Renders one provider (Codex or Claude) from the shared render view-model:
// header + Session/Weekly rows (bar + "X% left" + "Resets in …") + warning.
Rectangle {
    id: card

    property var service: null

    function _dim(c) { return Qt.rgba(c.r, c.g, c.b, 0.7); }

    Layout.fillWidth: true
    radius: 12
    color: Qt.rgba(Kirigami.Theme.textColor.r, Kirigami.Theme.textColor.g, Kirigami.Theme.textColor.b, 0.06)
    implicitHeight: col.implicitHeight + 24

    ColumnLayout {
        id: col
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: 12
        spacing: 4

        Text {
            text: card.service ? card.service.name : ""
            font.pixelSize: 15
            font.bold: true
            color: Kirigami.Theme.textColor
        }

        Repeater {
            model: card.service ? card.service.windows : []

            delegate: ColumnLayout {
                Layout.fillWidth: true
                Layout.topMargin: 8
                spacing: 4

                Text {
                    text: modelData.label
                    font.pixelSize: 13
                    font.bold: true
                    color: Kirigami.Theme.textColor
                }

                UsageBar {
                    Layout.fillWidth: true
                    remainingPct: modelData.remainingPct
                    colorName: modelData.dotColor
                }

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: modelData.remainingText
                        font.pixelSize: 12
                        color: card._dim(Kirigami.Theme.textColor)
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: modelData.resetsInText
                        font.pixelSize: 12
                        color: card._dim(Kirigami.Theme.textColor)
                    }
                }
            }
        }

        Text {
            Layout.topMargin: 4
            visible: !!(card.service && card.service.warning && card.service.warning.length > 0)
            text: card.service ? card.service.warning : ""
            font.pixelSize: 12
            color: "#f87171"
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
    }
}
