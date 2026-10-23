'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const root = join(__dirname, '..', '..');
const origin = 'https://workforcetimetracker.com';
const files = readdirSync(root).filter(file => file.endsWith('.html'))
    .concat(readdirSync(join(root, 'download')).filter(file => file.endsWith('.html')).map(file => `download/${file}`));
const read = file => readFileSync(join(root, ...file.split('/')), 'utf8');
const decode = value => value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const indexable = files.filter(file => !/<meta\b[^>]*content="noindex/i.test(read(file)));
const landing = indexable.filter(file => read(file).includes('class="breadcrumbs"'));

test('searchable pages have unique focused metadata, a canonical URL and one main heading', () => {
    const titles = new Set();
    const descriptions = new Set();
    for (const file of indexable) {
        const html = read(file);
        const title = decode(html.match(/<title>([^<]+)<\/title>/)[1]);
        const description = decode(html.match(/<meta name="description" content="([^"]+)"/)[1]);
        assert.ok(title.length <= 70, `${file}: title length ${title.length}`);
        assert.ok(description.length >= 100 && description.length <= 170, `${file}: description length ${description.length}`);
        assert.ok(!titles.has(title), `${file}: duplicate title`);
        assert.ok(!descriptions.has(description), `${file}: duplicate description`);
        titles.add(title);
        descriptions.add(description);
        assert.equal((html.match(/<h1\b/g) || []).length, 1, file);
        assert.ok(html.includes(`rel="canonical" href="${origin}/${file === 'index.html' ? '' : file}"`), file);
    }
});

test('all local links, fragments, images, scripts and styles resolve without network access', () => {
    for (const file of files) {
        const html = read(file);
        for (const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) {
            const value = decode(match[1]);
            if (/^(?:mailto:|tel:|data:|javascript:)/.test(value)) continue;
            const url = new URL(value, `${origin}/${file}`);
            if (url.origin !== origin) continue;
            const destination = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
            const local = destination.endsWith('/') ? destination + 'index.html' : destination;
            assert.ok(existsSync(join(root, ...local.split('/'))), `${file}: missing ${value}`);
            if (url.hash && local.endsWith('.html')) {
                const id = decodeURIComponent(url.hash.slice(1));
                assert.ok(read(local).includes(`id="${id}"`) || read(local).includes(`id='${id}'`),
                    `${file}: missing fragment ${value}`);
            }
        }
    }
});

test('sitemap lists exactly the canonical indexable HTML pages, never redirects or reports', () => {
    const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
    const urls = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1]).sort();
    assert.deepEqual(urls, indexable.map(file => `${origin}/${file === 'index.html' ? '' : file}`).sort());
    assert.equal(new Set(urls).size, urls.length);
    assert.match(readFileSync(join(root, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/workforcetimetracker\.com\/sitemap\.xml/);
});

test('sitemap dates reflect the October discovery updates without changing the EULA date', () => {
    const entries = Array.from(read('sitemap.xml').matchAll(/<url>([\s\S]*?)<\/url>/g));
    assert.equal(entries.length, indexable.length);
    for (const [, entry] of entries) {
        const url = entry.match(/<loc>([^<]+)<\/loc>/)[1];
        const date = entry.match(/<lastmod>([^<]+)<\/lastmod>/)[1];
        assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(date <= new Date().toISOString().slice(0, 10), `${url}: future modification date`);
        if (!url.endsWith('/eula.html')) {
            assert.ok(date >= '2026-10-23', `${url}: predates its substantive discovery update`);
        }
    }
});

test('all structured data parses; breadcrumb and FAQ entities have required fields', () => {
    for (const file of files) {
        for (const match of read(file).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
            const data = JSON.parse(match[1]);
            assert.equal(data['@context'], 'https://schema.org', file);
            if (data['@type'] === 'BreadcrumbList') {
                data.itemListElement.forEach((item, i) => {
                    assert.equal(item.position, i + 1);
                    assert.ok(item.name && item.item.startsWith(origin + '/'));
                });

            }
            if (data['@type'] === 'FAQPage') {
                data.mainEntity.forEach(item => assert.ok(item.name && item.acceptedAnswer.text, file));
            }
        }
    }
});

test('release metadata and platform downloads agree with the update manifest', () => {
    const manifest = JSON.parse(read('version.json').replace(/^\uFEFF/, ''));
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    const application = Array.from(read('index.html').matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    match => JSON.parse(match[1])).find(data => data['@type'] === 'SoftwareApplication');
    assert.equal(application.softwareVersion, manifest.version);
    for (const [platform, suffix] of [['windows', 'win-x64.zip'], ['mac', 'macos-arm64.dmg']]) {
        const filename = `WorkforceTimeTracker_v${manifest.version}_${suffix}`;
        const expected = `https://github.com/TimGitHub/workforcetimetracker.com/releases/download/v${manifest.version}/${filename}`;
        assert.ok(read(`download/${platform}.html`).includes(`href="${expected}"`));
        if (platform === 'windows') {
            assert.equal(application.downloadUrl, expected);
            assert.equal(manifest.download_url, `${origin}/${filename}`);
            assert.ok(existsSync(join(root, filename)), 'Missing Windows auto-update ZIP');
        }
    }
    assert.ok(read('updates.html').includes(`<h2>v${manifest.version}</h2>`));
});

test('guide and network disclosures do not promise nonexistent controls or Mac compact view', () => {
    const guide = read('guide.html');
    assert.ok(guide.includes('Windows compact view and overflow menu are not available'));
    assert.ok(guide.includes('More &gt; Compact view'));
    assert.ok(guide.includes('Minimise is a separate title-bar control'));
    assert.match(guide, /\.screenshot img \{[\s\S]*?max-width:\s*100%/);
    assert.doesNotMatch(guide, /<img[^>]+style="[^"]*max-width:\s*\d+px/);
    assert.doesNotMatch(guide, /\bv\d+\.\d+\.\d+\b|Workforce Timetracker/i);
    for (const file of ['guide.html', 'index.html', 'offline-time-tracker.html']) {
        assert.doesNotMatch(read(file), /(?:can be disabled|Disable it) in Settings/i, file);
    }
});

test('landing pages have crawlable breadcrumbs, main landmarks and above-fold downloads', () => {
    assert.ok(landing.length >= 11);
    for (const file of landing) {
        const html = read(file);
        assert.match(html, /<main id="main-content">/, file);
        assert.match(html, /class="skip-link"/, file);
        const hero = html.split('<section class="hero">')[1].split('</section>')[0];
        assert.match(hero, /href="\/download\/(?:windows|mac)\.html" class="btn btn-primary"/, file);
        assert.match(hero, /14-day free trial/);
    }
});

test('home pricing and primary download paths work without JavaScript', () => {
    const html = read('index.html');
    const pricing = html.split('id="pricingGrid"')[1].split('</section>')[0];
    assert.equal((pricing.match(/class="price-card(?: featured)?"/g) || []).length, 3);
    assert.match(pricing, /EUR 5/);
    assert.match(pricing, /EUR 50/);
    assert.ok(!html.includes('REPLACE_ME'));
    const hero = html.split('<section class="hero">')[1].split('</section>')[0];
    assert.match(hero, /href="\/download\/windows.html"/);
    assert.match(hero, /href="\/download\/mac.html"/);
    assert.match(html, /<details class="mobile-nav">/);
    assert.match(html, /\.fade-in \{ opacity: 1;/);
    assert.match(html, /id="find-your-workflow"/);
});

test('tablet navigation is only collapsed when a replacement menu exists', () => {
    const css = read('assets/discovery.css');
    assert.match(css, /nav\.has-mobile-menu \.nav-links li:not\(:last-child\)/);
    assert.ok(!css.includes('nav .nav-links li:not(:last-child)'));
    for (const file of ['index.html', 'mac.html']) {
        const html = read(file);
        assert.match(html, /<nav class="has-mobile-menu"/);
        assert.match(html, /<details class="mobile-nav">/);
    }
    assert.match(read('mac.html'), /href="assets\/discovery\.css"/);
});

test('purchase guidance does not treat a visit as payment and separates support from licences', () => {
    const thanks = read('thanks.html');
    assert.match(thanks, /This page does not verify payment/);
    assert.match(thanks, /Online checkout is not available yet/);
    assert.match(thanks, /confirm available payment options before sending payment/);
    assert.match(thanks, /If you have already paid, keep your receipt/);
    assert.match(thanks, /After we verify a <strong>licence purchase/);
    assert.match(thanks, /does <strong>not<\/strong> activate or renew a licence/);
    assert.match(thanks, /On macOS, open About \/ License/);
    assert.doesNotMatch(thanks, /Payment received|Stripe confirmed|session_id|noreply@stripe|Your next steps after checkout/);
    const home = read('index.html');
    assert.match(home, /no card required/);
    assert.match(home, /Online checkout is not available yet/);
    assert.match(home, /Request a licence by email to confirm available payment options before sending payment/);
    assert.match(home, /Renewal arranged by email/);
    assert.match(home, /Contributions are optional and do not activate a licence/);
    assert.doesNotMatch(home, /Billed monthly\. Cancel anytime/);
    for (const html of [home, thanks]) {
        assert.doesNotMatch(html, /href=["']https:\/\/(?:checkout\.stripe\.com|buy\.stripe\.com|(?:www\.)?buymeacoffee\.com)\//i);
    }
});

test('download pages retain real manual links and never claim completed transfers', () => {
    for (const file of ['download/windows.html', 'download/mac.html']) {
        const html = read(file);
        assert.match(html, /name="robots" content="noindex, follow"/);
        assert.match(html, /id="manualLink" href="https:\/\/github.com\/TimGitHub\/workforcetimetracker\.com\/releases\/download\//);
        assert.match(html, /id="downloadStatus" role="status"/);
        assert.ok(!html.includes('window.location.href'));
        assert.match(html, /src="\/assets\/download.js"/);
    }
    assert.ok(!read('timesheet-app-windows.html').includes('a signed Inno Setup installer'));
});

function downloadHarness(url) {
    let timer;
    let clicked = 0;
    const listeners = {};
    const status = { textContent: 'Ready' };
    const link = {
        href: url,
        addEventListener: (type, callback) => { listeners[type] = callback; },
        click: () => { clicked++; listeners.click(); }
    };
    const context = {
        URL,
        document: { getElementById: id => id === 'manualLink' ? link : status },
        window: { setTimeout: callback => { timer = callback; } }
    };
    runInNewContext(read('assets/download.js'), context);
    return { status, link, runTimer: () => timer(), clicks: () => clicked };
}

test('automatic download is one request and a manual click does not trigger a second automatic request', () => {
    const url = `${origin.replace('workforcetimetracker.com', 'github.com')}/TimGitHub/workforcetimetracker.com/releases/download/v1/windows.zip`;
    const automatic = downloadHarness(url);
    automatic.runTimer();
    assert.equal(automatic.clicks(), 1);
    assert.match(automatic.status.textContent, /Download requested/);
    const manual = downloadHarness(url);
    manual.link.click();
    manual.runTimer();
    assert.equal(manual.clicks(), 1);
    assert.throws(() => downloadHarness('https://attacker.example/file.zip'), /official release asset/);
});

test('report defaults to three calendar months and clamps short-month boundaries', () => {
    for (const [today, expected] of [
        ['2026-10-23', '2026-07-23'],
        ['2026-05-31', '2026-02-28'],
        ['2026-01-31', '2025-10-31']
    ]) {
        const elements = new Map();
        class FixedDate extends Date {
            constructor(...args) { super(...(args.length ? args : [today + 'T12:00:00Z'])); }
        }
        runInNewContext(read('assets/stats.js'), {
            Date: FixedDate,
            document: {
                getElementById(id) {
                    if (!elements.has(id)) elements.set(id, { addEventListener() {} });
                    return elements.get(id);
                }
            },
            fetch: () => new Promise(() => {})
        });
        assert.equal(elements.get('fromDate').value, expected);
        assert.equal(elements.get('toDate').value, today);
    }
});
