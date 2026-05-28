import QtQuick 2.15
import org.kde.plasma.plasma5support as Plasma5Support

// Reads local files and the user's home directory by running short commands
// through the Plasma "executable" DataSource. Used instead of file:// XHR,
// which is deprecated and disabled by default on newer Qt.
Item {
    id: reader

    property var _pending: ({})

    Plasma5Support.DataSource {
        id: ds
        engine: "executable"
        connectedSources: []
        onNewData: {
            ds.disconnectSource(sourceName);
            var cb = reader._pending[sourceName];
            if (cb) {
                delete reader._pending[sourceName];
                cb(data);
            }
        }
    }

    function _shq(s) {
        return "'" + String(s).replace(/'/g, "'\\''") + "'";
    }

    function _run(cmd) {
        return new Promise(function (resolve) {
            reader._pending[cmd] = resolve;
            ds.connectSource(cmd);
        });
    }

    // readFile(absolutePath) -> Promise<string>
    function readFile(path) {
        return reader._run("cat " + reader._shq(path)).then(function (data) {
            if (data["exit code"] === 0)
                return data["stdout"];
            throw new Error("Failed to read file: " + path);
        });
    }

    // resolveHome() -> Promise<string>  (no trailing newline)
    function resolveHome() {
        return reader._run("printenv HOME").then(function (data) {
            return (data["stdout"] || "").replace(/\n+$/, "");
        });
    }
}
