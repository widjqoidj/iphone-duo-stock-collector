# Duo Watch — Pittsburgh

A **$0 additional cost** personal tracker for iPhone Duo **512GB, unlocked**, in
Star White and Night Sky, at **Shadyside, Ross Park, and South Hills Village**.

The dashboard uses free GitHub Pages. A custom GitHub Actions workflow uses only
the standard `ubuntu-latest` runner in this public repository. It checks Apple's
pickup endpoint, saves the results, publishes the dashboard, and sends Web Push
notifications directly. There is no paid database, external notification service,
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

Once connected, normal scheduled runs send stock changes automatically. The app
can stay closed. A notification opens the matching Apple product page, or the
dashboard for grouped matches. Availability is not a reservation or a quantity.
Confirm your selected store and configuration on Apple before traveling.

Only the repository owner can add the Actions secret. If you add another device,
use a JSON array containing both subscription objects in `PUSH_SUBSCRIPTIONS`.

## Notifications and checks

- The target interval is **five minutes**, offset from the top of the hour.
  GitHub schedules are best effort and can be delayed or dropped under load.
- The dashboard marks results stale after 15 minutes without confirmation.
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

## Free-only configuration

Keep the repository **public**, `runs-on: ubuntu-latest`, the default `github.io`
domain, and GitHub Pages publishing through the custom Actions workflow. Private
repositories and larger runners can have different billing. Do not switch to
them without reviewing costs. This project does not purchase upgrades or enable
paid services. GitHub may restrict or stop service at its limits; no paid fallback
is configured. Provider terms can change; this is not a promise of perpetual
third-party availability.

Public data contains stock observations and redacted delivery totals. Device
subscription endpoints and the private signing key are stored only in Actions
secrets. `site-config.json` contains the intentionally public VAPID key.

The `VAPID_KEYS` Actions secret is a JSON object with `publicKey` and `privateKey`.
Preserve it across updates; changing it requires devices to resubscribe.
The workflow's **GITHUB_TOKEN** is the normal short-lived repository token used
to save stock state and deploy Pages; no personal access token is required.

## Stop the tracker

Open **Actions → Check stock and publish Duo Watch → … → Disable workflow**.
To stop alerts on one iPhone, tap **Turn off on this device** and remove or update
the `PUSH_SUBSCRIPTIONS` secret. To remove the dashboard, unpublish GitHub Pages
in repository **Settings → Pages**.

## Source and local use

`apple.mjs`, `config.mjs`, and `stock.mjs` are generated from the tested TypeScript
modules in the original workspace. `run.mjs` is the cloud job. The static app is
`index.html`, `app.js`, `styles.css`, `sw.js`, and its manifest/icons.

```sh
npm ci --ignore-scripts --no-audit --no-fund
node run.mjs
python3 -m http.server 4329 --directory public --bind 127.0.0.1
```

Local runs save state and build `public/`; they do not push repository commits.
Push delivery requires `VAPID_KEYS` and `PUSH_SUBSCRIPTIONS` in the environment.
Do not put their values in source. Localhost on your phone is not this computer.

## References

- [Free standard public GitHub Actions runners](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Pages availability and limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [iPhone Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

This is an independent personal project, not affiliated with Apple or GitHub.
