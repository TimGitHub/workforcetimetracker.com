(function () {
    'use strict';

    var link = document.getElementById('manualLink');
    var status = document.getElementById('downloadStatus');
    if (!link || !status) throw new Error('Download page is missing its link or status.');

    var destination = new URL(link.href);
    var prefix = 'https://github.com/TimGitHub/workforcetimetracker.com/releases/download/';
    if (destination.href.indexOf(prefix) !== 0 || !/\.(zip|dmg)$/.test(destination.pathname)) {
        status.textContent = 'Download unavailable. Please contact support.';
        throw new Error('Download destination must be an official release asset.');
    }

    var requested = false;
    link.addEventListener('click', function () {
        requested = true;
        status.textContent = 'Download requested. Check your browser downloads. If it was blocked, use the download link again.';
    });

    window.setTimeout(function () {
        if (!requested) link.click();
    }, 1500);
})();
