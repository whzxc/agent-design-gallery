# Publish ADG to npm

Prepare `package.json`, `package-lock.json` and `CHANGELOG.md` for the intended stable version and push the release commit to `main`. Open [Publish to npm](https://github.com/whzxc/agent-design-gallery/actions/workflows/publish.yml), choose `Run workflow` on `main`, and enter the exact version. The workflow checks the version, installs the locked dependencies and Chromium, runs the tests, and publishes to the public npm registry. A push to `main` does not start a release.

From the terminal, the same explicit trigger is `gh workflow run publish.yml --ref main -f version=<version>`. Check the Actions run and verify the released version with `npm view @whzxc/agent-design-gallery@<version> version --@whzxc:registry=https://registry.npmjs.org/`. The scope override is needed on machines that use a mirror for `@whzxc`.

## Set up trusted publishing

Once the workflow is on `main`, open the [npm package settings](https://www.npmjs.com/package/@whzxc/agent-design-gallery/access) and add a GitHub Actions trusted publisher with organization or user `whzxc`, repository `agent-design-gallery`, and workflow filename `publish.yml`. Leave the environment field blank, enable `Allow npm publish`, and leave `Allow npm dist-tag` disabled. Keep the existing publishing access policy that requires two-factor authentication and disallows bypass tokens. The workflow uses its GitHub identity to authenticate; it does not need an npm token secret.

Set up the connection when the first release is ready. [npm requires a successful first publish within two days](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry) to bind the connection to the repository.
