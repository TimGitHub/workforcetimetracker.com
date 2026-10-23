'use strict';

const { existsSync, readFileSync, writeFileSync, renameSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { validateHistory } = require('../../assets/download-metrics.js');

const repository = 'TimGitHub/workforcetimetracker.com';
const api = `https://api.github.com/repos/${repository}`;
const historyPath = join(__dirname, '..', '..', 'download-history.json');

async function request(url, { token, fetcher = fetch, method = 'GET' } = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'WorkforceTimeTracker-DownloadHistory' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetcher(url, {
        method, headers, redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`GitHub ${method} request failed: HTTP ${response.status}.`);
    return response.json();
}

async function collect({ token, fetcher, observedAt } = {}) {
    const assets = [];
    const releases = [];
    for (let page = 1; ; page++) {
        if (page > 100) throw new Error('Release pagination exceeded its safety limit.');
        const batch = await request(`${api}/releases?per_page=100&page=${page}`, { token, fetcher });
        if (!Array.isArray(batch)) throw new Error('GitHub returned an invalid release list.');
        releases.push(...batch.filter(release => !release.draft));
        if (batch.length < 100) break;
    }
    for (const release of releases) {
        for (let page = 1; ; page++) {
            if (page > 100) throw new Error('Asset pagination exceeded its safety limit.');
            const batch = await request(`${api}/releases/${release.id}/assets?per_page=100&page=${page}`, { token, fetcher });
            if (!Array.isArray(batch)) throw new Error('GitHub returned an invalid release-asset list.');
            for (const asset of batch) {
                let platform;
                if (/^WorkforceTimeTracker_.*_win-x64\.zip$/.test(asset.name)) platform = 'windows';
                else if (/^WorkforceTimeTracker_.*_macos-arm64\.dmg$/.test(asset.name)) platform = 'mac';
                else continue;
                assets.push({
                    id: asset.id, name: asset.name, release: release.tag_name, platform,
                    created_at: asset.created_at, count: asset.download_count, url: asset.browser_download_url
                });
            }
            if (batch.length < 100) break;
        }
    }
    const snapshot = { observed_at: observedAt || new Date().toISOString(), assets: assets.sort((a, b) => a.id - b.id) };
    validateHistory({ schema_version: 1, snapshots: [snapshot] });
    return snapshot;
}

function appendSnapshot(history, snapshot) {
    const updated = { schema_version: 1, snapshots: [...validateHistory(history).snapshots, snapshot] };
    return validateHistory(updated);
}

async function rebuildPages({ token, fetcher } = {}) {
    if (!token) throw new Error('A GitHub Actions token is required to request a Pages build.');
    const pages = await request(`${api}/pages`, { token, fetcher });
    if (pages.build_type !== 'legacy' || pages.source?.branch !== 'main' || pages.source?.path !== '/') {
        throw new Error('Download-history publishing requires the existing branch-based Pages source (main, root).');
    }
    const build = await request(`${api}/pages/builds`, { token, fetcher, method: 'POST' });
    if (!build.status) throw new Error('GitHub did not return a Pages build status.');
    return build;
}

async function main() {
    const token = process.env.GITHUB_TOKEN;
    if (process.argv[2] === '--collect') {
        const history = existsSync(historyPath)
            ? JSON.parse(readFileSync(historyPath, 'utf8'))
            : { schema_version: 1, snapshots: [] };
        const snapshot = await collect({ token });
        const updated = appendSnapshot(history, snapshot);
        const temporary = historyPath + '.tmp';
        try {
            writeFileSync(temporary, JSON.stringify(updated, null, 2) + '\n');
            renameSync(temporary, historyPath);
        } finally {
            if (existsSync(temporary)) rmSync(temporary);
        }
        console.log(`Saved ${snapshot.assets.length} aggregate counters at ${snapshot.observed_at}.`);
    } else if (process.argv[2] === '--rebuild-pages') {
        const build = await rebuildPages({ token });
        console.log(`Pages rebuild requested: ${build.status}.`);
    } else {
        throw new Error('Use --collect or --rebuild-pages. Neither operation runs during tests.');
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { collect, appendSnapshot, rebuildPages };
