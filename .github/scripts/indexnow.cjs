'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const host = 'workforcetimetracker.com';
// IndexNow's public ownership-verification key, also served by the website.
const key = 'c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2';

function buildPayload(changedFiles, readHtml) {
    const paths = [...new Set(changedFiles.split('\0').filter(path => {
        if (!path.endsWith('.html')) return false;
        if (!readHtml) return true;
        const html = readHtml(path);
        if (/<meta\b[^>]*http-equiv=["']refresh["']/i.test(html)) return false;
        return !Array.from(html.matchAll(/<meta\b[^>]*>/gi)).some(([tag]) =>
            /\bname=["']robots["']/i.test(tag) && /\bcontent=["'][^"']*\bnoindex\b/i.test(tag));
    }))].sort();
    if (paths.length === 0) return null;

    return {
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: paths.map(path =>
            `https://${host}/${path === 'index.html' ? '' : path.split('/').map(encodeURIComponent).join('/')}`)
    };
}

if (require.main === module) {
    const changedFiles = execFileSync('git', [
        'diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD~1', 'HEAD', '--', '*.html'
    ], { encoding: 'utf8' });
    const payload = buildPayload(changedFiles, file => readFileSync(resolve(file), 'utf8'));
    if (payload) process.stdout.write(JSON.stringify(payload) + '\n');
}

module.exports = { buildPayload };
