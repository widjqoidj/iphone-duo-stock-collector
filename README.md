# Duo Watch — Pittsburgh

A **$0 additional cost** personal tracker for iPhone Duo **512GB, unlocked**, in
Star White and Night Sky, at **Shadyside, Ross Park, and South Hills Village**.

The dashboard uses free GitHub Pages. A custom GitHub Actions workflow uses only
the standard `ubuntu-latest` runner in this public repository. It checks Apple's
pickup endpoint, saves the results, publishes the dashboard, and sends Web Push
notifications directly. The external timer integration uses the free cron-job.org
HTTP scheduler; see [setup and verification](EXTERNAL_TIMER.md). There is no paid database, external notification service,
custom domain, OpenAI API call, or paid runner.

## Install on your iPhone

1. Open **https://widjqoidj.github.io/iphone-duo-stock-collector/** in **Safari**.
2. Tap **Share → Add to Home Screen → Add**. Open **Duo Watch** from its new icon.
3. Tap **Enable notifications → Allow**. Requires iOS 16.4 or later.
4. Tap **Copy iPhone setup code**, then **Open GitHub secret settings**. Sign in as
   the repository owner. Set **Name** to `PUSH_SUBSCRIPTIONS`, paste the copied
   code into **Secret**, then tap **Add secret**. Never paste it into a public file
   or issue. This connects the cloud checker to this specific installed app.
5. Tap **Open workflow to send a test**. Choose **Run workflow**, check the
   **send_test** option, and run it. Close Duo Watch and check your Lock Screen or
   Notification Center after the run. Seeing the notification completes setup;
   a successful workflow alone does not prove phone delivery.

Once both the timer and device are connected, scheduled runs send stock changes automatically. The app
can stay closed. A notification opens the matching Apple product page, or the
dashboard for grouped matches. Availability is not a reservation or a quantity.
Confirm your selected store and configuration on Apple before traveling.

Only the repository owner can add the Actions secret. If you add another device,
use a JSON array containing both subscription objects in `PUSH_SUBSCRIPTIONS`.

## Notifications and checks

- The target interval is **five minutes**. cron-job.org can trigger the
  `stock.yml` workflow directly, bypassing GitHub's unreliable native timer.
  GitHub can still delay runner execution. Complete the
  [external timer setup](EXTERNAL_TIMER.md) and verify two scheduled runs.
  The old native timer must remain disabled while using the external scheduler.
- The dashboard marks results stale after 15 minutes without confirmation.
  It refreshes published data when reopened, after connectivity returns, and once
  per minute while visible. It does not send extra Apple requests from the phone.
- App health reports data freshness, the last timer-triggered run, and push
  configuration separately. A successful manual check does not prove the timer
  is working. If cloud checks are overdue, use **Run stock check → Run workflow**
  in GitHub. Reloading the dashboard alone cannot restart the cloud checker.
- A request failure never becomes a sold-out result; the previous confirmed state
  remains saved. The last 20 checks appear on the dashboard.
- Alerts fire for first observed availability, restocks, and pickup-date changes.
  Unchanged stock does not generate duplicate alerts.
- Stock notifications expire after five minutes. Health/recovery notices are
  deduplicated. Pending events are committed before sending; retries are bounded.
  Exactly-once delivery and real-time detection are not guaranteed.
- **Refresh** reloads published data. It does not start an Apple check. Use the
  Actions page's **Run workflow** for an on-demand cloud check.
- GitHub can disable scheduled workflows in public repositories after 60 days
  without repository activity. Review the Actions page if checks stop.
- If an expired subscription fails, turn it off in the app, enable it again, and
  replace `PUSH_SUBSCRIPTIONS` with the new setup code.

## Daily restock trend

The dashboard shows the last 30 Eastern Time calendar days, with today marked
in progress. Each count is one store/color changing from confirmed unavailable
to available. First-seen availability, pickup-date changes, unchanged stock, and
unknown-to-available recovery from previously available stock do not count.
Changes that happen between checks may be missed.

Daily totals are saved with stock state for up to 365 days, independently of the
20-check activity list. The existing cloud checks update today's total and roll
into a new daily bar after midnight Eastern Time; no extra Apple requests or
paid services are used. Missing or entirely unverified days are shown separately
from verified zero-restock days. Select a day to see store totals and check coverage.

Run `node scripts/backfill-trend.mjs` from a full repository checkout to rebuild
historical totals from saved `state.json` snapshots. It deduplicates repeated
saves of a check and preserves the current stock and notification state. Commit
the resulting state with the feature deployment. Normal cloud runs only append
to the stored totals; they do not require full Git history.

## Historical reports and restock outlook

Under **Trends → History source**, choose **Other trackers · partial history**
to see reviewed 512GB restock reports from before this tracker began. The two
histories stay separate: imported reports do not verify the unlocked option,
replace live Apple results, send notifications, or count as our own observations.
Missing external dates mean no imported records, never a confirmed zero.

The November 2 snapshot contains 13 reported transitions from InStock Radar
(October 27 and 30) and six last-in-stock values from Wenstock. Each record has
its store, color, original timestamp with an explicit UTC offset, source URL,
event type, and carrier scope. **Sources and records** shows the attribution and
timestamp on the dashboard. Last-in-stock sightings are not transitions and
are excluded from histogram counts. The sources disagree on some last dates
and times; their records are retained separately, not combined as confirmation.

Source pages:

- [InStock Radar Shadyside](https://instockradar.com/us/store/shadyside/iphone-duo)
- [InStock Radar Ross Park](https://instockradar.com/us/store/rosspark/restocks)
- [InStock Radar South Hills Village](https://instockradar.com/us/store/southhillsvillage/iphone-duo)
- [Wenstock Shadyside](https://wenstock.app/store/shadyside)
- [Wenstock Ross Park](https://wenstock.app/store/ross-park)
- [Wenstock South Hills Village](https://wenstock.app/store/south-hills-village)

`data/external-history.json` is a reviewed, attributed historical snapshot, not
an automated feed. InStock Radar's history pages permit attributed quotation;
its [terms](https://instockradar.com/legal/terms) prohibit scraping. There is no
third-party scraper, account, subscription, or paid API. To extend the snapshot,
review permitted public factual records or an authorized export, add their
provenance and explicit offset, and run the checks before publishing. Do not
import marketing examples, national aggregates, other capacities, or generic
all-iPhone store counts. `historicalRecords()` rejects incompatible records,
future/ambiguous timestamps, unrecognized sources, and exact duplicate rows.

**Restock outlook** shows descriptive, whole-hour spans from the imported reports.
These are clues from a small, incomplete sample, not a promise of another drop
in those hours. The experimental date estimate trains only on this tracker's
own confirmed unlocked transitions from the most recent 28 Eastern calendar days.
It requires all of the following:

- At least 14 completed days with 225 fully verified checks each, and no uncovered
  completed day between the first restock day used and today.
- At least five distinct restock days spanning 14 days and eight store episodes.
  Colors returning together and repeated changes within 30 minutes of a store's
  episode start count as one episode, so stock flaps cannot inflate the sample.

The estimate covers any of the three stores. It adds the 25th–75th percentile
of gaps between observed restock days to the latest restock date. This is an
experimental historical range, **not a calibrated confidence interval or a
validated predictive model**. If that range has already passed, it is withheld
rather than moved forward. A missing-coverage or insufficient-data result also
withholds the estimate. Current history is too small for a date prediction.

Own event timestamps are persisted alongside daily totals for up to 365 days;
the repository backfill also reconstructs this ledger. The outlook recomputes
when published results load, and cloud checks persist new events. Five-minute
checks can miss brief availability. Everything runs locally in the existing
workflow/browser; there are no additional requests to Apple or paid services.

## Free-only configuration

Keep the repository **public**, `runs-on: ubuntu-latest`, the default `github.io`
domain, and GitHub Pages publishing through the custom Actions workflow. Private
repositories and larger runners can have different billing. Do not switch to
them without reviewing costs. This project does not purchase upgrades or enable
paid services. GitHub may restrict or stop service at its limits; no paid fallback
is configured. Provider terms can change; this is not a promise of perpetual
third-party availability.

The workflow skips its job if this repository becomes private. Published artifacts
are small and expire after one day; it does not create long-lived caches or use
larger runners. The dashboard displays public stock data, while push credentials
remain in repository secrets.

Public data contains stock observations and redacted delivery totals. Device
subscription endpoints and the private signing key are stored only in Actions
secrets. `site-config.json` contains the intentionally public VAPID key.

The `VAPID_KEYS` Actions secret is a JSON object with `publicKey` and `privateKey`.
Preserve it across updates; changing it requires devices to resubscribe.
The workflow's **GITHUB_TOKEN** is the normal short-lived repository token used
to save stock state and deploy Pages; no personal access token is required.

## Stop the tracker

Disable **Duo Watch stock check** in cron-job.org. Keep the old GitHub native
timer disabled. Manual checks remain available under
**Actions → Check stock and publish Duo Watch**.
To stop alerts on one iPhone, tap **Turn off on this device** and remove or update
the `PUSH_SUBSCRIPTIONS` secret. To remove the dashboard, unpublish GitHub Pages
in repository **Settings → Pages**.

## Source and local use

The active source is maintained directly in this repository:

- `config.mjs`: stores, product variants, and the five-minute polling interval.
- `apple.mjs`: one stock request and validation of Apple's response.
- `stock.mjs`: confirmed stock state, change detection, and alert grouping.
- `trend.mjs` and `trend-chart.js`: daily restock aggregation and interactive histogram.
- `scripts/backfill-trend.mjs`: rebuilds daily totals from saved repository history.
- `history.mjs` and `data/external-history.json`: validation and provenance for external history.
- `prediction.mjs` and `outlook.js`: guarded date estimate, historical hours, and source records.
- `run.mjs`: cloud job orchestration, state persistence, push delivery, and publishing.
- `.github/workflows/timer.yml`: legacy native timer; disable when using cron-job.org.
- `automation.mjs`: distinguishes external timer, native timer, and manual requests.
- `EXTERNAL_TIMER.md`: external timer configuration and verification.
- `.github/workflows/stock.yml`: shared stock-check and publishing job, also runnable manually.
- `app.js`: dashboard rendering and iPhone notification setup.
- `health.mjs`: shared freshness rules and app health messages.
- `sw.js`: background push notifications and notification links.
- `index.html`, `styles.css`, manifest, and icons: the dashboard presentation.
- `tests.mjs`: regression tests for parsing, stock transitions, and alerts.

Use descriptive function and variable names. Keep source collection, stock decisions,
push delivery, and rendering in their respective files. Comments explain constraints
such as preserving confirmed stock during a failed check or requesting iPhone
permission directly from a button tap.

Prettier handles consistent formatting. Run `npm run format` after editing;
`npm run format:check` verifies formatting without changing files and also runs in CI.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run format:check
npm test
node run.mjs
python3 -m http.server 4329 --directory public --bind 127.0.0.1
```

Local runs save state and build `public/`; they do not push repository commits.
Push delivery requires `VAPID_KEYS` and `PUSH_SUBSCRIPTIONS` in the environment.
Do not put their values in source. Localhost on your phone is not this computer.

`test-fixture.json` is a reduced real Apple response captured November 1, 2026;
all six results were unavailable. Available states in the tests are synthetic.

## References

- [Free standard public GitHub Actions runners](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Pages availability and limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [iPhone Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

This is an independent personal project, not affiliated with Apple or GitHub.
