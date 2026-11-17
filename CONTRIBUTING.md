# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

This project is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces). It contains the following packages:

- The library package in the root directory.
- An example app in the `example/` directory.

Use the Node.js version in [`.nvmrc`](./.nvmrc) and the pnpm version in the `packageManager` field of `package.json`. Then install dependencies from the root directory:

```sh
pnpm install
```

The workspace uses pnpm's hoisted linker (`nodeLinker: hoisted` in `pnpm-workspace.yaml`), because React Native's native tooling (CocoaPods autolinking, codegen, Metro) expects a flat `node_modules`.

The [example app](/example/) uses the library from source, so JavaScript changes show up without a rebuild. Native changes need a rebuild of the example app. To edit the Objective-C files in Xcode, open `example/ios/GranularSafeAreasExample.xcworkspace` and find them at `Pods > Development Pods > react-native-granular-safe-areas`.

Common commands, run from the root directory:

- `pnpm example start`: start Metro for the example app.
- `pnpm example ios`: build and run the example app on iOS. The iPhone Duo APIs need Xcode 27.1 (iOS 27.1 SDK).
- `pnpm example web`: run the example app on the web. Its iPhone Duo simulation uses recorded metrics, so you can work on layout without a device.
- `pnpm example build:web`: build the example app for the web.
- `pnpm test`: run the unit tests with Jest.
- `pnpm typecheck`: type-check with TypeScript.
- `pnpm lint`: lint with ESLint. Use `pnpm lint --fix` to fix formatting.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.
