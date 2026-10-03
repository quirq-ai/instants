# Security policy

## Scope

Security fixes target the current default branch. There are no separately supported release lines or guaranteed response times.

Instants is a demonstration UI. Its social interactions are stored in browser memory, uploaded images remain local, and only the selected theme is persisted by the app. It does not provide production authentication, authorization, private messaging, or durable storage. The repository also contains hosting and connector scaffolding; review any such integration before enabling it in a deployment.

The default demo loads remote photographs and a font stylesheet. Those providers receive the ordinary browser requests needed to load their assets. Keep secrets and personal data out of mock data, screenshots, issue reports, and local hosting configuration committed to Git.

## Report a vulnerability

Use **Report a vulnerability** in the repository's [Security tab](https://github.com/quirq-ai/instants/security) when private reporting is available. Include:

- The affected commit or version and the component involved.
- Reproduction steps or a minimal proof of concept using fictional data.
- The impact and relevant browser or runtime details.
- A proposed fix, if you have one.

If private reporting is unavailable, open a public issue asking maintainers for a private reporting channel. Do not include exploit details, tokens, personal data, or sensitive logs in that issue. Do not test against systems or accounts you do not control.

Ordinary UI bugs and feature requests belong in the public issue tracker.
