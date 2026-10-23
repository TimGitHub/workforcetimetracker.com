(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.WTT_DOWNLOAD_METRICS = factory();
})(typeof window === 'object' ? window : this, function () {
    'use strict';

    var assetPrefix = 'https://github.com/TimGitHub/workforcetimetracker.com/releases/download/';

    function timestamp(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
            !Number.isFinite(Date.parse(value))) throw new Error('Invalid UTC observation timestamp.');
        return Date.parse(value);
    }

    function validateHistory(history) {
        if (!history || history.schema_version !== 1 || !Array.isArray(history.snapshots)) {
            throw new Error('Unsupported download history format.');
        }
        var lastTime = -Infinity;
        var knownAssets = new Map();
        history.snapshots.forEach(function (snapshot) {
            var observed = timestamp(snapshot.observed_at);
            if (observed <= lastTime || !Array.isArray(snapshot.assets)) {
                throw new Error('Snapshots must be complete lists in strictly increasing timestamp order.');
            }
            lastTime = observed;
            var ids = new Set();
            snapshot.assets.forEach(function (asset) {
                if (!asset || !Number.isSafeInteger(asset.id) || asset.id <= 0 || ids.has(asset.id) ||
                    !Number.isSafeInteger(asset.count) || asset.count < 0 ||
                    !['windows', 'mac'].includes(asset.platform) ||
                    typeof asset.name !== 'string' || asset.name.length === 0 ||
                    typeof asset.release !== 'string' || asset.release.length === 0 ||
                    typeof asset.url !== 'string' || !asset.url.startsWith(assetPrefix) ||
                    timestamp(asset.created_at) > observed) {
                    throw new Error('Invalid or duplicate release asset counter.');
                }
                var known = knownAssets.get(asset.id);
                if (known && (known.platform !== asset.platform || known.created_at !== asset.created_at)) {
                    throw new Error('A stable asset ID changed identity.');
                }
                ids.add(asset.id);
                knownAssets.set(asset.id, asset);
            });
        });
        return history;
    }

    function summarize(history, from, to) {
        validateHistory(history);
        var start = timestamp(from);
        var end = timestamp(to);
        if (start > end) throw new Error('The start date must not follow the end date.');
        var selected = history.snapshots.filter(function (snapshot) {
            var time = timestamp(snapshot.observed_at);
            return time >= start && time <= end;
        });
        var warnings = new Set();
        var intervals = [];
        var totals = { windows: 0, mac: 0 };
        for (var i = 1; i < selected.length; i++) {
            var before = selected[i - 1];
            var after = selected[i];
            var previous = new Map(before.assets.map(function (asset) { return [asset.id, asset]; }));
            var current = new Map(after.assets.map(function (asset) { return [asset.id, asset]; }));
            var requests = { windows: 0, mac: 0 };
            if (timestamp(after.observed_at) - timestamp(before.observed_at) > 12 * 60 * 60 * 1000) {
                warnings.add('An observation gap exceeds 12 hours; changes cannot be allocated to individual days inside that gap.');
            }
            after.assets.forEach(function (asset) {
                var old = previous.get(asset.id);
                var increase;
                if (old && asset.count >= old.count) increase = asset.count - old.count;
                else if (old) warnings.add('Counter decreased for ' + asset.name + '; this interval is incomplete.');
                else if (timestamp(asset.created_at) >= timestamp(before.observed_at)) increase = asset.count;
                else warnings.add('No prior baseline for ' + asset.name + '; its existing requests were not counted as new.');
                if (increase !== undefined) {
                    requests[asset.platform] += increase;
                    totals[asset.platform] += increase;
                    if (!Number.isSafeInteger(totals[asset.platform])) throw new Error('Counter total exceeds safe numeric precision.');
                }
            });
            before.assets.forEach(function (asset) {
                if (!current.has(asset.id)) warnings.add('Asset unavailable: ' + asset.name + '; requests before removal may be missing.');
            });
            intervals.push({ from: before.observed_at, to: after.observed_at, windows: requests.windows, mac: requests.mac });
        }
        if (selected.length < 2) warnings.add('At least two observations inside the selected range are needed. The first observation is a baseline, not new traffic.');
        if (history.snapshots.length && start < timestamp(history.snapshots[0].observed_at)) {
            warnings.add('Tracking started after the selected start date. Earlier requests cannot be reconstructed.');
        }
        if (!Number.isSafeInteger(totals.windows + totals.mac)) throw new Error('Counter total exceeds safe numeric precision.');
        return {
            from: selected.length ? selected[0].observed_at : null,
            to: selected.length ? selected[selected.length - 1].observed_at : null,
            observations: selected.length,
            requests: intervals.length ? totals.windows + totals.mac : null,
            windows: intervals.length ? totals.windows : null,
            mac: intervals.length ? totals.mac : null,
            intervals: intervals,
            warnings: Array.from(warnings)
        };
    }

    return { validateHistory: validateHistory, summarize: summarize };
});
