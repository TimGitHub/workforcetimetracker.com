'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { buildPayload } = require('./indexnow.cjs');

const generator = join(__dirname, 'indexnow.cjs');
const workflow = readFileSync(join(__dirname, '..', 'workflows', 'indexnow.yml'), 'utf8');
const postScript = workflow.split('      - name: POST to IndexNow')[1]
    .split('        run: |')[1].trim().replace(/^          /gm, '');
const bash = process.platform === 'win32'
    ? join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    : 'bash';
const hasBash = spawnSync(bash, ['--version'], { stdio: 'ignore' }).status === 0;

function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'wtt-indexnow-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, {
        cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    const commit = () => {
        git('add', '--all');
        git('-c', 'user.name=Security Regression', '-c', 'user.email=test@example.invalid',
            '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Test fixture');
    };
    git('init', '--quiet');
    writeFileSync(join(directory, 'index.html'), '<h1>Before</h1>');
    commit();
    return { directory, git, commit };
}

test('empty and non-HTML changes do not produce a payload', () => {
    assert.equal(buildPayload(''), null);
    assert.equal(buildPayload('sitemap.xml\0assets/pricing.js\0'), null);
});

test('payload preserves the public host/key and deduplicates HTML URLs', () => {
    const payload = buildPayload('download/windows.html\0index.html\0index.html\0');
    assert.equal(payload.host, 'workforcetimetracker.com');
    assert.equal(payload.keyLocation, `https://${payload.host}/${payload.key}.txt`);
    assert.equal(readFileSync(join(__dirname, '..', '..', `${payload.key}.txt`), 'utf8').trim(), payload.key);
    assert.deepEqual(payload.urlList, [
        'https://workforcetimetracker.com/download/windows.html',
        'https://workforcetimetracker.com/'
    ]);
});

test('shell syntax, quotes, commas, newlines and Unicode remain filename data', () => {
    const paths = [
        '$(printf CI_FILENAME_INJECTION).html',
        "a'$(printf CI_JSON_INJECTION)'b.html",
        'folder/a,b #?%.html',
        'quote"and\\backslash.html',
        'line\nbreak.html',
        'caf\u00e9.html'
    ];
    const payload = JSON.parse(JSON.stringify(buildPayload(paths.join('\0') + '\0')));
    assert.equal(payload.urlList.length, paths.length);
    assert.deepEqual(payload.urlList.map(url => {
        assert.equal(new URL(url).origin, 'https://workforcetimetracker.com');
        return decodeURIComponent(new URL(url).pathname.slice(1));
    }).sort(), paths.sort());
});

test('CLI reads real git changes, excludes deletions, and handles renames and hostile filenames', t => {
    const { directory, git, commit } = fixture(t);
    writeFileSync(join(directory, 'deleted.html'), 'Deleted');
    writeFileSync(join(directory, 'old.html'), 'Renamed');
    commit();
    rmSync(join(directory, 'deleted.html'));
    renameSync(join(directory, 'old.html'), join(directory, 'renamed.html'));
    writeFileSync(join(directory, 'index.html'), '<h1>After</h1>');
    const hostile = "a'$(printf CI_JSON_INJECTION)'b.html";
    writeFileSync(join(directory, hostile), 'Safe filename data');
    commit();
    const payload = JSON.parse(execFileSync(process.execPath, [generator], { cwd: directory, encoding: 'utf8' }));
    assert.deepEqual(payload.urlList.map(url => decodeURIComponent(new URL(url).pathname.slice(1))).sort(),
        ['', hostile, 'renamed.html'].sort());
    assert.equal(git('status', '--porcelain'), '');
});

test('CLI emits nothing when no HTML changes remain', t => {
    const { directory, commit } = fixture(t);
    writeFileSync(join(directory, 'sitemap.xml'), '<urlset/>');
    commit();
    assert.equal(execFileSync(process.execPath, [generator], { cwd: directory, encoding: 'utf8' }), '');
});

test('index submissions omit noindex utilities and redirects and use the canonical home URL', () => {
    const html = {
        'index.html': '<h1>Home</h1>',
        'stats.html': '<meta content="noindex, follow" name="robots">',
        'thanks.html': '<meta name="robots" content="noindex, follow">',
        'windows.html': '<meta http-equiv="refresh" content="0; url=./timesheet-app-windows.html">'
    };
    const payload = buildPayload(Object.keys(html).join('\0'), file => html[file]);
    assert.deepEqual(payload.urlList, ['https://workforcetimetracker.com/']);
});

test('git errors fail the CLI rather than looking like an empty successful result', t => {
    const { directory } = fixture(t);
    const result = spawnSync(process.execPath, [generator], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /HEAD~1/);
});

test('workflow pins checkout and does not interpolate expressions into shell commands', () => {
    assert.match(workflow, /uses: actions\/checkout@[a-f0-9]{40}\b/);
    assert.match(workflow, /persist-credentials: false/);
    assert.ok(!workflow.includes('${{'));
    assert.match(postScript, /--data-binary @"\$RUNNER_TEMP\/indexnow-payload\.json"/);
});

for (const response of ['200', '202', '500', 'transport-error', 'no-html']) {
    test(`workflow shell handles ${response} without network access or filename execution`, { skip: !hasBash }, t => {
        const { directory, commit } = fixture(t);
        mkdirSync(join(directory, '.github', 'scripts'), { recursive: true });
        copyFileSync(generator, join(directory, '.github', 'scripts', 'indexnow.cjs'));
        const hostile = "a'$(printf CI_JSON_INJECTION)'b.html";
        writeFileSync(join(directory, response === 'no-html' ? 'sitemap.xml' : hostile), 'Test content');
        commit();
        const runnerTemp = join(directory, 'runner-temp');
        mkdirSync(runnerTemp);
        const stub = `
curl() {
    printf '%s\\n' "$@" > "$RUNNER_TEMP/curl-args"
    for arg in "$@"; do
        if [[ "$arg" == @* ]]; then
            cp "\${arg#@}" "$RUNNER_TEMP/submitted.json"
        fi
    done
    : > "$RUNNER_TEMP/indexnow-response.body"
    if [ "$MOCK_RESPONSE" = "transport-error" ]; then return 7; fi
    printf '%s' "$MOCK_RESPONSE"
}
`;
        const result = spawnSync(bash, ['-c', stub + postScript], {
            cwd: directory,
            encoding: 'utf8',
            env: { ...process.env, RUNNER_TEMP: runnerTemp.replace(/\\/g, '/'), MOCK_RESPONSE: response }
        });
        assert.equal(result.status, ['500', 'transport-error'].includes(response) ? (response === '500' ? 1 : 7) : 0,
            result.stderr || result.stdout);
        if (response === 'no-html') {
            assert.ok(!existsSync(join(runnerTemp, 'curl-args')));
            assert.match(result.stdout, /skipping/);
        } else {
            const payload = JSON.parse(readFileSync(join(runnerTemp, 'submitted.json'), 'utf8'));
            assert.equal(decodeURIComponent(new URL(payload.urlList[0]).pathname.slice(1)), hostile);
            if (response === '500') assert.match(result.stdout, /::error::IndexNow returned 500/);
        }
    });
}
