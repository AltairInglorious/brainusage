import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';

test('metadata UUID is usage-limits@example', () => {
    const metadata = JSON.parse(readFileSync('extension/metadata.json', 'utf-8'));
    expect(metadata.uuid).toBe('usage-limits@example');
});
