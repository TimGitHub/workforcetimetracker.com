'use strict';

const { execFileSync } = require('node:child_process');

const host = 'workforcetimetracker.com';
// IndexNow's public ownership-verification key, also served by the website.
const key = 'c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2';

function buildPayload(changedFiles) {
    const paths = [...new Set(changedFiles.split('\0').filter(path => path.endsWith('.html')))].sort();
    if (paths.length === 0) return null;

    return {
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: paths.map(path =>
            `https://${host}/${path.split('/').map(encodeURIComponent).join('/')}`)
    };
}

if (require.main === module) {
    const changedFiles = execFileSync('git', [
        'diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD~1', 'HEAD', '--', '*.html'
    ], { encoding: 'utf8' });
    const payload = buildPayload(changedFiles);
    if (payload) process.stdout.write(JSON.stringify(payload) + '\n');
}

module.exports = { buildPayload };
