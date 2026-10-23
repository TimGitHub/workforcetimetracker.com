(function () {
    'use strict';

    var status = document.getElementById('reportStatus');
    var form = document.getElementById('rangeForm');
    var from = document.getElementById('fromDate');
    var to = document.getElementById('toDate');
    var history;
    var today = new Date().toISOString().slice(0, 10);
    to.value = today;
    to.max = today;
    from.max = today;
    var initial = new Date(today + 'T00:00:00.000Z');
    var dayOfMonth = initial.getUTCDate();
    initial.setUTCMonth(initial.getUTCMonth() - 3);
    if (initial.getUTCDate() !== dayOfMonth) initial.setUTCDate(0);
    from.value = initial.toISOString().slice(0, 10);

    function cell(row, value, header) {
        var element = document.createElement(header ? 'th' : 'td');
        element.textContent = value;
        row.appendChild(element);
    }

    function render() {
        var report = window.WTT_DOWNLOAD_METRICS.summarize(
            history, from.value + 'T00:00:00.000Z', to.value + 'T23:59:59.999Z');
        document.getElementById('requestCount').textContent = report.requests === null ? 'Not yet measurable' : report.requests;
        document.getElementById('windowsCount').textContent = report.windows === null ? '\u2014' : report.windows;
        document.getElementById('macCount').textContent = report.mac === null ? '\u2014' : report.mac;
        document.getElementById('coverage').textContent = report.from
            ? 'Observed coverage: ' + report.from + ' to ' + report.to + '. Only complete intervals between observations are included, not the unobserved range boundaries.'
            : 'No observations in this date range.';
        var warnings = document.getElementById('reportWarnings');
        warnings.replaceChildren();
        report.warnings.forEach(function (warning) {
            var item = document.createElement('li');
            item.textContent = warning;
            warnings.appendChild(item);
        });
        var rows = document.getElementById('intervals');
        rows.replaceChildren();
        report.intervals.slice(-120).reverse().forEach(function (interval) {
            var row = document.createElement('tr');
            cell(row, interval.from);
            cell(row, interval.to);
            cell(row, interval.windows);
            cell(row, interval.mac);
            rows.appendChild(row);
        });
        var last = history.snapshots[history.snapshots.length - 1];
        var assets = document.getElementById('latestAssets');
        assets.replaceChildren();
        if (last) last.assets.forEach(function (asset) {
            var row = document.createElement('tr');
            cell(row, asset.name);
            cell(row, asset.release);
            cell(row, asset.count);
            assets.appendChild(row);
        });
        document.getElementById('reportOutput').hidden = false;
        status.textContent = last ? 'Last observation: ' + last.observed_at + ' (UTC).' : 'No baseline has been collected yet.';
        if (last && Date.now() - Date.parse(last.observed_at) > 18 * 60 * 60 * 1000) {
            status.textContent += ' History is stale: check the scheduled workflow before interpreting recent totals.';
        }
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        try { render(); }
        catch (error) {
            document.getElementById('reportOutput').hidden = true;
            status.textContent = 'Unable to update the report: ' + error.message;
            console.error('Download report failed.', error);
        }
    });

    fetch('/download-history.json', { cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) throw new Error('History request returned HTTP ' + response.status + '.');
            return response.json();
        })
        .then(function (data) {
            history = window.WTT_DOWNLOAD_METRICS.validateHistory(data);
            render();
            document.getElementById('updateReport').disabled = false;
        })
        .catch(function (error) {
            status.textContent = 'Download history is unavailable: ' + error.message;
            console.error('Unable to load download history.', error);
        });
})();
