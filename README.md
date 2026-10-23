# Workforce Time Tracker website

Static HTML/CSS/JavaScript site published from the root of `main` through GitHub Pages.
No PHP runtime, package installation or application backend is required.

## Local checks

Use Node.js 22 or newer and Git:

```powershell
node --test .\.github\scripts\indexnow.test.cjs .\.github\scripts\download-stats.test.cjs .\.github\scripts\site.test.cjs
git diff --check
```

The suite uses fixtures, temporary local Git repositories and a mocked `curl`. It does
not download installers, send analytics events or call live services.

Site checks cover canonical URLs, sitemap coverage, unique metadata, local links and
fragments, structured-data syntax, crawlable pricing, prominent download links,
download-request behavior, and counter-history calculations.

## Findability and download paths

- The homepage links directly to existing workflow-specific pages, not new keyword
  doorway pages. Each landing page has visible breadcrumbs and early download links.
- Titles, descriptions and sharing metadata describe the actual workflow and limitations.
  Pricing and essential download links remain available without JavaScript.
- The sitemap contains canonical, indexable pages only. Update `lastmod` when the page
  changes substantively, not on every deployment.
- IndexNow submits changed indexable HTML only, uses `/` for the homepage and omits
  redirects, thank-you pages, download interstitials and the statistics report.
- All current site download buttons go through `/download/windows.html` or
  `/download/mac.html`, which keep setup help and a manual release-asset link visible.
  The shared script requests the file once; it cannot detect completed transfers.
- Preserve legacy URLs and binaries for existing bookmarks and desktop update clients.
  Direct requests for those website-hosted binaries bypass GitHub release counters.
- The public Windows build is unsigned; Mac is an Apple Silicon alpha and is not
  Apple-notarized. Do not advertise unavailable signed installers or bypass an
  organisation's device policies.

### Next measurement-led search improvements

The site already contains Google and Bing ownership-verification tags. An authenticated
owner should verify the correct properties in Search Console and Bing Webmaster Tools,
submit `https://workforcetimetracker.com/sitemap.xml`, and inspect the homepage plus the
platform and workflow pages. The Google Search Console session available during this
change was not signed in, so actual indexed-page counts and query performance were not
verified.

Review organic impressions, queries, click-through rate and landing pages regularly.
Use that evidence to improve the existing pages with concrete examples, rather than
mass-producing similar pages. Search ranking changes are not immediate or guaranteed.
Code-signing Windows and notarizing the Mac build are important remaining trust and
installation improvements that require the desktop release project and certificates.

## Dated download statistics

[The report](https://workforcetimetracker.com/stats.html) reads
[download-history.json](./download-history.json). It is deliberately `noindex`.

The **Download history** workflow records public GitHub release-asset counters every six
hours, at approximately 00:17, 06:17, 12:17 and 18:17 UTC. Scheduled Actions may be delayed.
Each observation is committed, even if counts did not change. A manual `workflow_dispatch`
run is also available. This preserves history and establishes zero-increase periods.

The workflow has narrowly scoped `contents: write` and `pages: write` permissions. It
commits only the aggregate JSON, rebases onto `main`, and uses a normal push, never force.
A conflict fails visibly. GitHub-token commits do not automatically build Pages, so the
workflow verifies the existing `main`/root branch-based source and explicitly requests a
Pages rebuild. If the hosting mode changes, update that publishing step too.

For an explicit manual observation (this calls GitHub's API):

```powershell
node .\.github\scripts\download-stats.cjs --collect
```

No personal token is required for this public read at normal usage. Actions uses its
ephemeral token from the environment. Never put tokens in this JSON or in source code.

### What the report measures

- **Cumulative asset counters:** public request counts, including requests before tracking
  started. The first observation is a baseline, not traffic attributable to that date.
- **Date-range increases:** differences between complete observations inside the selected
  UTC date boundaries. The report shows the actual observed start/end coverage and does
  not interpolate unobserved boundary periods.
- **Version continuity:** observations retain stable asset IDs across all published
  releases. A newly created asset first seen after the previous observation can start
  at zero. An older newly discovered asset needs a baseline. Old-version deltas remain
  included while those assets remain observable.
- **Incomplete data:** decreases, removals, old assets without baselines and long polling
  gaps are disclosed. Measurable increases on unaffected assets remain visible; they
  are not presented as a complete total for the missing data.
- **Collection freshness:** the report warns if the latest observation is over 18 hours
  old. Check the workflow and GitHub Pages build if it becomes stale.

These counters **cannot identify unique people, filter bots, prove a finished transfer,
or show installations**. Downloads directly from legacy website files are not covered.
Past monthly totals cannot be recreated from a current lifetime counter.

Cloudflare Web Analytics remains a separate source for bot-filtered website visits and
download-interstitial page views. Select this hostname and **Exclude bots = Yes**. Check
the sampling information and the date range. Browser blocking, the owner's own visits,
repeat visits and undetected automation can affect those reports. Do not divide sampled
page views by GitHub counters and call the result a verified human conversion rate.

No cookies, visitor IDs or telemetry in the desktop application were added.
