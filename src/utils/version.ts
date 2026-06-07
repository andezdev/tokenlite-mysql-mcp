import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');

export function getPackageVersion(): string {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
}
