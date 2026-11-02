# Free external timer

cron-job.org requests a GitHub Actions stock check every five minutes. The job
runs on the existing public standard Ubuntu runner and publishes to GitHub Pages.
The scheduler does not receive Apple responses, iPhone subscriptions, or VAPID keys.

## One-time account setup

Sign in to a free cron-job.org account. If creating an account, enter the password
and accept its terms yourself. Never paste passwords or tokens into a public file
or chat.

Create a fine-grained GitHub token named `Duo Watch timer` with these settings:

- Resource owner: `widjqoidj`.
- Repository access: **Only select repositories → iphone-duo-stock-collector**.
- Repository permission: **Actions → Read and write**. Metadata read is automatic.
- No Contents write or account permissions.
- Expiration: 90 days; renew it in the scheduler before it expires.

Actions write permission is needed to dispatch the workflow. It also permits
managing Actions runs in this repository, so keep the token private. Store it
only in cron-job.org's Authorization header. The existing broad GitHub credential
must not be reused for the external scheduler.

## Scheduler job

Create a job initially disabled so its settings can be reviewed before enabling.

| Setting                       | Value                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Title                         | Duo Watch stock check                                                                                      |
| URL                           | `https://api.github.com/repos/widjqoidj/iphone-duo-stock-collector/actions/workflows/stock.yml/dispatches` |
| Method                        | POST                                                                                                       |
| Schedule                      | Every 5 minutes, UTC                                                                                       |
| Header `Accept`               | `application/vnd.github+json`                                                                              |
| Header `Content-Type`         | `application/json`                                                                                         |
| Header `X-GitHub-Api-Version` | `2022-11-28`                                                                                               |
| Header `Authorization`        | `Bearer YOUR_REPOSITORY_SCOPED_TOKEN`                                                                      |
| Request body                  | Contents of `deployment/cron-job-request.json`                                                             |
| Save response data            | Off                                                                                                        |

The request body selects `timer_source: cron-job.org`, which marks the check as
an external timer request in the dashboard. Ordinary manual checks leave the
source set to `manual` and do not update the automatic-check timestamp.

Before enabling the external job, disable **Actions → Automatic stock checks**
to prevent duplicate checks if GitHub's native timer recovers. Keep the separate
**Check stock and publish Duo Watch** workflow enabled.

## Verification

Do not treat an accepted HTTP dispatch as a completed stock check. Observe a
naturally scheduled job execution, follow its matching GitHub run through
publishing, and confirm the app's last automatic check and timer service. Repeat
for a second scheduled execution about five minutes later. A manual workflow test
must use `timer_source: manual`.

A successful POST normally returns HTTP 204 with the selected GitHub API version.
A later GitHub job failure must be investigated in Actions. If the app says the
cloud check is overdue, check both cron-job.org history and GitHub Actions.

## Stop and renew

Disable **Duo Watch stock check** in cron-job.org to stop automatic checks.
Disabling the GitHub stock workflow also stops collection but causes dispatches
to fail until it is re-enabled. To revoke scheduler access, revoke its fine-grained
GitHub token. This does not change the iPhone push subscription or signing keys.

When renewing a token, use the same single-repository permissions, replace the
scheduler's Authorization header, and observe a scheduled execution before
revoking the old token.

## References

- [cron-job.org's free service](https://cron-job.org/en/)
- [GitHub workflow dispatch permissions](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)
- [Fine-grained token configuration](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
