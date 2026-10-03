# Contributing to Instants

Instants is a frontend prototype. Contributions should keep the demo easy to run, the interactions accessible, and the boundary between simulated and real behavior clear.

## Set up

Use Node.js 22.13 or newer and npm. Fork the repository, clone your fork, and create a branch for your change.

```sh
npm ci
npm run dev
```

The app runs on port 5180. `/motion` is the playground for shared motion primitives. No credentials are needed; the optional local hosting configuration falls back to `build/hosting.example.json`.

## Make a focused change

- Describe the problem and the observable result you want. Open an issue before a large feature or architectural change so maintainers can discuss scope.
- Keep brand values in `config/brand.json`, motion values in `config/motion.json`, and seed content in `data/mock.json`.
- Reuse existing components and keep state with the component that owns it. Read [the architecture guide](docs/architecture.md) before changing shared app state.
- Preserve native touch and wheel scrolling. Give gestures visible and keyboard-accessible alternatives, and respect reduced motion.
- Use fictional content. Do not commit credentials, personal conversations, production data, local hosting identity, or generated build output.
- Preserve upstream license notices. Include the source and license for any new third-party code or assets.

## Validate

```sh
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Install Playwright once per browser setup; on Linux use `npx playwright install --with-deps chromium` if system dependencies are missing. Add or update tests when behavior changes, especially gesture classification, persistence boundaries, or shared state.

For UI changes, inspect both themes at a narrow mobile width and a desktop width. Check keyboard focus, Escape dismissal, relevant touch/mouse gestures, and reduced motion. Include a screenshot or short recording when it helps explain the result. Record any checks you could not run and why.

## Open a pull request

Explain the problem, the resulting behavior, and how you checked it. Link related issues. Keep unrelated refactors and dependency changes in separate pull requests. Update documentation when setup, controls, configuration, or prototype limitations change.

By contributing, you agree that your contributions may be distributed under the project's [MIT license](LICENSE). Only submit work you have the right to contribute. Discuss people and ideas respectfully; prefer concrete examples and reproducible reports.

For security issues, follow [SECURITY.md](SECURITY.md) instead of posting sensitive details in a public issue.
