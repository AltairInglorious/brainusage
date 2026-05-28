import QtQuick 2.15

// Color-coded progress bar mirroring the GNOME extension's fill colors.
// `colorName` is the dotColor from the shared render view-model.
Item {
    id: bar

    property real remainingPct: 0
    property string colorName: "green"

    implicitHeight: 10

    function _fillColor(name) {
        if (name === "green") return "#22c55e";
        if (name === "yellow") return "#eab308";
        return "#ef4444";
    }

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: Qt.rgba(0.5, 0.5, 0.5, 0.25)

        Rectangle {
            height: parent.height
            width: Math.max(0, Math.min(1, bar.remainingPct / 100)) * parent.width
            radius: height / 2
            color: bar._fillColor(bar.colorName)
        }
    }
}
