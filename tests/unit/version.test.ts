import { describe, it, expect } from 'vitest';
import { getPackageVersion } from '../../src/utils/version.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

describe('getPackageVersion', () => {
    it('should return the version from package.json', () => {
        const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
        const expectedVersion = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
        expect(getPackageVersion()).toBe(expectedVersion);
    });
});
