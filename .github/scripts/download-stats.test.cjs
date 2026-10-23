'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { validateHistory, summarize } = require('../../assets/download-metrics.js');
const { appendSnapshot, collect, rebuildPages } = require('./download-stats.cjs');

const prefix = 'https://github.com/TimGitHub/workforcetimetracker.com/releases/download/v1/';
const times = ['2026-10-01T00:00:00.000Z', '2026-10-01T06:00:00.000Z', '2026-10-01T12:00:00.000Z'];
const asset = (id, count, platform = 'windows', created = '2026-09-01T00:00:00Z') => ({
    id, count, platform, created_at: created, release: 'v1',
    name: `WorkforceTimeTracker_v1_${platform === 'windows' ? 'win-x64.zip' : 'macos-arm64.dmg'}`,
    url: prefix + (platform === 'windows' ? 'windows.zip' : 'mac.dmg')
});
const history = (...assets) => ({
    schema_version: 1, snapshots: assets.map((items, i) => ({ observed_at: times[i], assets: items }))
});

test('first observation is a baseline, never period downloads or a success-shaped zero', () => {
    const report = summarize(history([asset(1, 21), asset(2, 9, 'mac')]), times[0], times[2]);
    assert.equal(report.requests, null);
    assert.equal(report.windows, null);
    assert.match(report.warnings.join(' '), /baseline/);
});

test('unchanged observed counters mean zero increases, not missing data', () => {
    const report = summarize(history([asset(1, 21)], [asset(1, 21)]), times[0], times[2]);
    assert.equal(report.requests, 0);
    assert.equal(report.observations, 2);
});

test('date range sums exact deltas per platform rather than cumulative lifetime totals', () => {
    const data = history(
        [asset(1, 21), asset(2, 9, 'mac')],
        [asset(1, 24), asset(2, 10, 'mac')],
        [asset(1, 26), asset(2, 13, 'mac')]);
    const report = summarize(data, times[0], times[2]);
    assert.equal(report.requests, 9);
    assert.equal(report.windows, 5);
    assert.equal(report.mac, 4);
    assert.equal(summarize(data, times[1], times[2]).requests, 5);
    assert.equal(summarize(data, '2026-10-01T01:00:00Z', '2026-10-01T11:00:00Z').requests, null);
});

test('ranges before tracking do not reconstruct downloads and report actual coverage', () => {
    const report = summarize(history([asset(1, 21)], [asset(1, 24)]), '2026-07-01T00:00:00Z', times[2]);
    assert.equal(report.requests, 3);
    assert.equal(report.from, times[0]);
    assert.equal(report.to, times[1]);
    assert.match(report.warnings.join(' '), /Earlier requests cannot be reconstructed/);
});

test('version rotation keeps old-asset increases and counts a newly created asset from zero', () => {
    const report = summarize(history(
        [asset(1, 20)],
        [asset(1, 22), asset(3, 5, 'windows', '2026-10-01T03:00:00Z')],
        [asset(1, 23), asset(3, 8, 'windows', '2026-10-01T03:00:00Z')]), times[0], times[2]);
    assert.equal(report.requests, 11);
    assert.equal(report.warnings.length, 0);
});

test('old newly discovered assets get a baseline instead of attributing their lifetime count', () => {
    const report = summarize(history([asset(1, 20)], [asset(1, 22), asset(3, 500)]), times[0], times[2]);
    assert.equal(report.requests, 2);
    assert.match(report.warnings.join(' '), /No prior baseline/);
});

test('decreases and removals are flagged; unaffected assets keep their measurable increases', () => {
    const report = summarize(history(
        [asset(1, 21), asset(2, 9, 'mac'), asset(3, 2)],
        [asset(1, 2), asset(2, 12, 'mac')]), times[0], times[2]);
    assert.equal(report.requests, 3);
    assert.match(report.warnings.join(' '), /Counter decreased/);
    assert.match(report.warnings.join(' '), /Asset unavailable/);
});

test('large observation gaps cannot masquerade as exact daily history', () => {
    const data = history([asset(1, 21)], [asset(1, 24)]);
    data.snapshots[1].observed_at = '2026-10-03T00:00:00Z';
    assert.match(summarize(data, times[0], '2026-10-04T00:00:00Z').warnings.join(' '), /gap exceeds 12 hours/);
});

test('invalid schemas, counts, timestamps, duplicate IDs and identity changes fail explicitly', () => {
    for (const modify of [
        data => { data.schema_version = 2; },
        data => { data.snapshots[0].assets[0].count = -1; },
        data => { data.snapshots[0].assets[0].count = Number.MAX_SAFE_INTEGER + 1; },
        data => { data.snapshots[0].observed_at = 'invalid'; },
        data => { data.snapshots[0].assets.push(asset(1, 1)); },
        data => { data.snapshots[1].assets[0].platform = 'mac'; },
        data => { data.snapshots[0].assets[0].url = 'https://attacker.example/file.zip'; }
    ]) {
        const data = history([asset(1, 21)], [asset(1, 24)]);
        modify(data);
        assert.throws(() => validateHistory(data));
    }
    assert.throws(() => summarize(history(), times[2], times[0]), /start date/);
});

test('appending observations preserves old assets and refuses out-of-order writes', () => {
    const data = history([asset(1, 21)]);
    const updated = appendSnapshot(data, { observed_at: times[1], assets: [asset(1, 21)] });
    assert.equal(data.snapshots.length, 1);
    assert.equal(updated.snapshots.length, 2);
    assert.throws(() => appendSnapshot(updated, updated.snapshots[0]), /increasing/);
});

test('collector paginates releases and assets, skips drafts and unrelated files, and uses fixtures only', async () => {
    const calls = [];
    const windows = { id: 1, name: 'WorkforceTimeTracker_v1_win-x64.zip', created_at: '2026-09-01T00:00:00Z', download_count: 21, browser_download_url: prefix + 'windows.zip' };
    const mac = { ...windows, id: 2, name: 'WorkforceTimeTracker_v1_macos-arm64.dmg', download_count: 9, browser_download_url: prefix + 'mac.dmg' };
    const fetcher = async (url, options) => {
        calls.push(url);
        assert.equal(options.headers.Authorization, 'Bearer fixture-only');
        assert.equal(options.redirect, 'error');
        let body;
        if (url.includes('/releases?')) body = url.endsWith('page=1')
            ? [{ id: 11, tag_name: 'v1', draft: false }, ...Array.from({ length: 99 }, (_, i) => ({ id: 100 + i, draft: true }))]
            : [];
        else body = url.endsWith('page=1')
            ? [windows, ...Array.from({ length: 99 }, (_, i) => ({ id: 200 + i, name: 'unrelated.txt' }))]
            : [mac];
        return new Response(JSON.stringify(body), { status: 200 });
    };
    const snapshot = await collect({ fetcher, token: 'fixture-only', observedAt: times[0] });
    assert.equal(calls.length, 4);
    assert.deepEqual(snapshot.assets.map(item => [item.platform, item.count]), [['windows', 21], ['mac', 9]]);
});

test('API failures and invalid responses fail instead of saving empty successful snapshots', async () => {
    await assert.rejects(collect({ fetcher: async () => new Response('{}', { status: 403 }) }), /HTTP 403/);
    await assert.rejects(collect({ fetcher: async () => new Response('{}') }), /invalid release list/);
});

test('Pages publishing verifies the existing source and explicitly requests a rebuild', async () => {
    const calls = [];
    const fetcher = async (url, options) => {
        calls.push([url, options.method]);
        return new Response(JSON.stringify(options.method === 'GET'
            ? { build_type: 'legacy', source: { branch: 'main', path: '/' } }
            : { status: 'queued' }), { status: options.method === 'POST' ? 201 : 200 });
    };
    assert.equal((await rebuildPages({ token: 'fixture-only', fetcher })).status, 'queued');
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1], 'POST');
    await assert.rejects(rebuildPages({ fetcher }), /token is required/);
    await assert.rejects(rebuildPages({ token: 'fixture-only', fetcher: async () =>
        new Response(JSON.stringify({ build_type: 'workflow' })) }), /branch-based/);
    await assert.rejects(rebuildPages({ token: 'fixture-only', fetcher: async () =>
        new Response('{}', { status: 403 }) }), /HTTP 403/);
});

test('scheduled collection has narrow permissions, persistent authentication and no force push', () => {
    const workflow = readFileSync(join(__dirname, '..', 'workflows', 'download-stats.yml'), 'utf8');
    assert.match(workflow, /cron: '17 \*\/6 \* \* \*'/);
    assert.match(workflow, /persist-credentials: true/);
    assert.match(workflow, /contents: write/);
    assert.match(workflow, /pages: write/);
    assert.match(workflow, /--rebuild-pages/);
    assert.ok(!workflow.includes('--force'));
    assert.match(workflow, /git add -- download-history\.json/);
});
