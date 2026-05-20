/**
 * install-cta.js - Floating "Install now" button.
 *
 * Adds an always-visible install button in the bottom-left corner of every page on
 * workforcetimetracker.com. Clicking opens a small popover with two options: Windows
 * (.zip via the /download/windows.html interstitial) and macOS (.dmg, alpha, via the
 * /download/mac.html interstitial). The user's OS is auto-detected and highlighted as
 * the recommended option.
 *
 * The component is fully self-contained: it injects its own CSS and HTML at runtime,
 * so adding the button to a new page is a one-liner:
 *
 *   <script defer src="/assets/install-cta.js"></script>
 *
 * Design notes:
 *   - Independent dark surface so it reads the same on light and dark pages
 *     (the marketing site has a mix of always-dark pages and theme-toggle pages).
 *   - Solid medium cyan (#0891B2) with white text - WCAG AA, project Rule 1 compliant
 *     (no same-hue bg + text combos, no low-contrast pairings).
 *   - No emojis anywhere - project Rule 2. SVG icons only.
 *   - Z-index 9998 - above page content, below interactive overlays/dialogs.
 *   - Skips itself on the two download interstitials (the user is already in the
 *     download flow there; another install button would be noise).
 */
(function () {
    'use strict';

    // Skip on the pages where the button would be redundant.
    //   - /download/* : user is already in the download flow.
    //   - /thanks.html: user has just purchased; the download instructions are on the page itself.
    var path = window.location.pathname;
    if (path.indexOf('/download/') !== -1) return;
    if (path === '/thanks.html' || path === '/thanks') return;

    // Respect a previous explicit dismissal. The user can re-enable the button by running
    //   localStorage.removeItem('install-cta-dismissed')
    // in the browser console, or by clearing site data.
    try {
        if (window.localStorage && window.localStorage.getItem('install-cta-dismissed') === '1') return;
    } catch (_) { /* localStorage can throw in privacy modes - safe to ignore, button shows. */ }

    // Avoid double-injection (defensive, in case the script is included twice on a page).
    if (document.getElementById('install-cta-root')) return;

    // ---- Platform detection ------------------------------------------------------------
    function detectPlatform() {
        var ua = navigator.userAgent || '';
        var p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
        if (/Mac|iPhone|iPad|iPod/i.test(ua) || /macOS|Mac/i.test(p)) return 'mac';
        if (/Windows|Win32|Win64|WOW64/i.test(ua) || /Win/i.test(p)) return 'win';
        return 'other';
    }
    var platform = detectPlatform();

    // ---- Styles ------------------------------------------------------------------------
    var css = [
        '#install-cta-root{position:fixed;left:20px;bottom:20px;z-index:9998;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
        '#install-cta-btn{display:inline-flex;align-items:center;gap:8px;background:#0891B2;color:#ffffff;border:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;line-height:1;cursor:pointer;box-shadow:0 8px 24px rgba(8,145,178,0.35),0 2px 6px rgba(0,0,0,0.18);transition:background 0.18s ease,transform 0.18s ease,box-shadow 0.18s ease;}',
        '#install-cta-btn:hover,#install-cta-btn:focus-visible{background:#22D3EE;color:#062a33;transform:translateY(-1px);box-shadow:0 10px 28px rgba(34,211,238,0.45),0 2px 6px rgba(0,0,0,0.22);outline:none;}',
        '#install-cta-btn:focus-visible{outline:2px solid #ffffff;outline-offset:2px;}',
        '#install-cta-btn svg{flex:0 0 auto;}',
        '#install-cta-btn .install-cta-label{white-space:nowrap;}',
        '#install-cta-pop{position:absolute;left:0;bottom:calc(100% + 12px);min-width:260px;background:#18181b;color:#fafafa;border:1px solid #3f3f46;border-radius:12px;padding:10px;box-shadow:0 12px 32px rgba(0,0,0,0.45);display:none;flex-direction:column;gap:6px;}',
        '#install-cta-pop.open{display:flex;}',
        '#install-cta-pop .install-cta-headrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px 4px;}',
        '#install-cta-pop .install-cta-head{font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#a1a1aa;margin:0;}',
        '#install-cta-pop .install-cta-close{background:transparent;border:none;color:#a1a1aa;cursor:pointer;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;padding:0;transition:background 0.15s ease,color 0.15s ease;}',
        '#install-cta-pop .install-cta-close:hover,#install-cta-pop .install-cta-close:focus-visible{background:#3f3f46;color:#fafafa;outline:none;}',
        '#install-cta-pop .install-cta-close:focus-visible{outline:2px solid #22D3EE;outline-offset:1px;}',
        '#install-cta-pop a.install-cta-opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;text-decoration:none;color:#fafafa;background:#27272a;border:1px solid transparent;transition:background 0.15s ease,border-color 0.15s ease;}',
        '#install-cta-pop a.install-cta-opt:hover,#install-cta-pop a.install-cta-opt:focus-visible{background:#3f3f46;outline:none;}',
        '#install-cta-pop a.install-cta-opt:focus-visible{border-color:#22D3EE;}',
        '#install-cta-pop a.install-cta-opt.recommended{border-color:#0891B2;}',
        '#install-cta-pop .install-cta-opt-icon{flex:0 0 auto;width:22px;height:22px;display:grid;place-items:center;color:#22D3EE;}',
        '#install-cta-pop .install-cta-opt-body{flex:1 1 auto;min-width:0;}',
        '#install-cta-pop .install-cta-opt-title{display:block;font-size:13px;font-weight:600;color:#fafafa;}',
        '#install-cta-pop .install-cta-opt-meta{display:block;font-size:11px;color:#a1a1aa;margin-top:2px;}',
        '#install-cta-pop .install-cta-opt-tag{display:inline-block;background:#0891B2;color:#ffffff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px;vertical-align:1px;}',
        '#install-cta-pop .install-cta-opt-tag.alpha{background:#F59E0B;color:#0A0A0A;}',
        '#install-cta-pop .install-cta-foot{font-size:11px;color:#a1a1aa;padding:6px 8px 2px;text-align:center;}',
        '#install-cta-pop .install-cta-foot a{color:#22D3EE;text-decoration:none;}',
        '#install-cta-pop .install-cta-foot a:hover,#install-cta-pop .install-cta-foot a:focus-visible{text-decoration:underline;outline:none;}',
        '@media (max-width:480px){#install-cta-root{left:14px;bottom:14px;}#install-cta-btn{padding:12px;}#install-cta-btn .install-cta-label{display:none;}}',
        '@media print{#install-cta-root{display:none!important;}}',
        '@media (prefers-reduced-motion:reduce){#install-cta-btn{transition:none;}#install-cta-btn:hover,#install-cta-btn:focus-visible{transform:none;}}'
    ].join('');
    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-install-cta', '');
    styleEl.appendChild(document.createTextNode(css));
    document.head.appendChild(styleEl);

    // ---- Markup ------------------------------------------------------------------------
    var winRec = platform === 'win' ? ' recommended' : '';
    var macRec = platform === 'mac' ? ' recommended' : '';
    var winRecText = platform === 'win' ? '<span class="install-cta-opt-tag">For you</span>' : '';
    var macRecText = platform === 'mac' ? '<span class="install-cta-opt-tag">For you</span>' : '';

    var html = [
        '<button id="install-cta-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="install-cta-pop" aria-label="Install Workforce Time Tracker - choose Windows or macOS">',
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 12l-4-4h2.5V2h3v6H12L8 12zm-6 2h12v1.5H2V14z"/></svg>',
        '<span class="install-cta-label">Install now</span>',
        '</button>',
        '<div id="install-cta-pop" role="menu" aria-label="Choose your platform">',
        '<div class="install-cta-headrow">',
        '<span class="install-cta-head">Free 14-day trial &middot; no account</span>',
        '<button type="button" class="install-cta-close" aria-label="Hide the install button on this site" title="Hide the install button">',
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>',
        '</button>',
        '</div>',
        '<a class="install-cta-opt' + winRec + '" role="menuitem" href="/download/windows.html">',
        '<span class="install-cta-opt-icon">',
        '<svg width="18" height="18" viewBox="0 0 88 88" fill="currentColor" aria-hidden="true"><path d="M0 12.402L35.687 7.541L35.703 41.97L0.033 42.174L0 12.402ZM35.67 45.94L35.698 80.398L0.029 75.493L0.027 45.708L35.67 45.94ZM39.996 6.906L87.314 0V41.527L39.996 41.903V6.906ZM87.325 46.262L87.314 87.605L39.996 80.927L39.93 46.184L87.325 46.262Z"/></svg>',
        '</span>',
        '<span class="install-cta-opt-body">',
        '<span class="install-cta-opt-title">Windows' + winRecText + '</span>',
        '<span class="install-cta-opt-meta">.zip portable &middot; Windows 10 / 11 (64-bit)</span>',
        '</span>',
        '</a>',
        '<a class="install-cta-opt' + macRec + '" role="menuitem" href="/download/mac.html">',
        '<span class="install-cta-opt-icon">',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.05 12.04a4.62 4.62 0 0 1 2.2-3.88 4.73 4.73 0 0 0-3.73-2.02c-1.57-.16-3.07.93-3.87.93-.81 0-2.04-.91-3.36-.88a4.97 4.97 0 0 0-4.18 2.55c-1.79 3.1-.46 7.69 1.28 10.2.85 1.23 1.86 2.61 3.18 2.56 1.29-.05 1.77-.83 3.32-.83 1.54 0 1.98.83 3.33.8 1.38-.02 2.25-1.24 3.08-2.48a10.95 10.95 0 0 0 1.4-2.86 4.46 4.46 0 0 1-2.65-4.09zM14.5 4.7a4.55 4.55 0 0 0 1.04-3.27 4.62 4.62 0 0 0-3 1.55 4.31 4.31 0 0 0-1.07 3.15 3.83 3.83 0 0 0 3.03-1.43z"/></svg>',
        '</span>',
        '<span class="install-cta-opt-body">',
        '<span class="install-cta-opt-title">macOS' + macRecText + '<span class="install-cta-opt-tag alpha">ALPHA</span></span>',
        '<span class="install-cta-opt-meta">.dmg &middot; Apple Silicon (arm64)</span>',
        '</span>',
        '</a>',
        '<div class="install-cta-foot"><a href="/#download">See full download details &amp; pricing</a></div>',
        '</div>'
    ].join('');

    var root = document.createElement('div');
    root.id = 'install-cta-root';
    root.innerHTML = html;
    document.body.appendChild(root);

    // ---- Behavior ----------------------------------------------------------------------
    var btn = root.querySelector('#install-cta-btn');
    var pop = root.querySelector('#install-cta-pop');

    function setOpen(open) {
        if (open) {
            pop.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            // Move focus to the recommended (or first) option for keyboard users.
            var target = pop.querySelector('a.install-cta-opt.recommended') || pop.querySelector('a.install-cta-opt');
            if (target) target.focus({ preventScroll: true });
        } else {
            pop.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    }
    function isOpen() { return pop.classList.contains('open'); }

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(!isOpen());
    });

    // Outside click closes.
    document.addEventListener('click', function (e) {
        if (!isOpen()) return;
        if (root.contains(e.target)) return;
        setOpen(false);
    });

    // Escape closes and returns focus to the trigger.
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) {
            setOpen(false);
            btn.focus({ preventScroll: true });
        }
    });

    // Clicking a download link closes the popover (the navigation will take over anyway,
    // but this keeps state clean if the user opens a new tab via middle-click).
    Array.prototype.forEach.call(pop.querySelectorAll('a'), function (a) {
        a.addEventListener('click', function () { setOpen(false); });
    });

    // Dismiss handler: hide the button on every page on this site until the user clears
    // their site data (or removes the localStorage flag manually). Confirmed via the small
    // 'x' in the popover header - the user must deliberately open the popover first, so an
    // accidental dismissal is essentially impossible.
    var closeBtn = pop.querySelector('.install-cta-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            try { window.localStorage && window.localStorage.setItem('install-cta-dismissed', '1'); } catch (_) { /* ignore */ }
            root.parentNode && root.parentNode.removeChild(root);
        });
    }
})();
