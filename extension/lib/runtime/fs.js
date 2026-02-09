import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function resolvePath(filePath) {
    if (typeof filePath !== 'string' || filePath.length === 0)
        throw new Error('filePath must be a non-empty string');

    if (filePath.startsWith('~/'))
        return `${GLib.get_home_dir()}${filePath.slice(1)}`;

    return filePath;
}

function loadContents(file) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(null, (source, result) => {
            try {
                const [ok, contents] = source.load_contents_finish(result);
                if (!ok) {
                    reject(new Error(`Failed to read file: ${file.get_path()}`));
                    return;
                }

                resolve(contents);
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function readTextFile(filePath) {
    const resolvedPath = resolvePath(filePath);
    const file = Gio.File.new_for_path(resolvedPath);
    const contents = await loadContents(file);
    return new TextDecoder().decode(contents);
}
