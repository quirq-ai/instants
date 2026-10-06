# Security policy

## Scope

Security fixes target the current default branch. There are no separately supported release lines or guaranteed response times.

Instants visualizes selected agent data with private browser-profile state. A local Node server stores `.instants/<UUID>/timeline.jsonl` and `.instants/<UUID>/activity.jsonl`. Vercel uses the origin-scoped `instants-timeline-v1` and `instants-activity-v1` browser keys. There is no authenticated team identity, external message delivery or cross-device synchronization.

The local API chooses a random UUID through an `HttpOnly`, `SameSite=Lax` cookie, validates request origins and log records, and bounds storage. These controls are not a production account system or authorization to read arbitrary machine data. The server owner can inspect local files; people sharing a browser profile share its state. Logs and exports are plaintext. Selected native history, images and private notes can appear in the logs; local mode sends normalized imported data to the local server.

Native imports only read files explicitly selected or pasted by the person. They do not automatically discover `.agents`, use agent credentials, execute source instructions, or send replies/approvals upstream. Source text is displayed as text. Source identity and read-only capabilities are validated at the data boundary. No connector/plugin scaffold implies an enabled external integration.

Runtime logs and legacy sessions are ignored by Git and excluded from Next.js deployment tracing through `next.config.ts`; filesystem code opts out of tracing runtime paths. Never publish logs, private exports or transcript screenshots. Pending file writes remain in memory, without a persistent third outbox, until acknowledged. Export or retry failed saves before closing the tab. Clearing site data can remove hosted logs, and losing a cookie can detach a local profile. Exports are manual backups; automatic legacy migration, account deletion, retention policies and shared-team recovery are not implemented.

The local store rejects competing ownership using a loopback process lock. Malformed or unterminated records produce visible blocking diagnostics and preserve original bytes. Recovery must not silently reset a profile or overwrite unreadable history. Browser storage is a different durability and concurrency boundary and can reach its quota earlier than local files.

The initial examples load remote photographs and a font stylesheet. Those providers receive ordinary browser requests for their assets. Imported image URLs can also make browser requests to their hosts. Keep secrets and personal data out of fixtures, screenshots, issue reports and checked-in hosting configuration.

## Report a vulnerability

Use **Report a vulnerability** in the repository's [Security tab](https://github.com/quirq-ai/instants/security) when private reporting is available. Include:

- The affected commit or version and the component involved.
- Reproduction steps or a minimal proof of concept using fictional data.
- The impact and relevant browser or runtime details.
- A proposed fix, if you have one.

If private reporting is unavailable, open a public issue asking maintainers for a private reporting channel. Do not include exploit details, tokens, personal data, or sensitive logs in that issue. Do not test against systems or accounts you do not control.

Ordinary UI bugs and feature requests belong in the public issue tracker.
