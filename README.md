# Ping An Mobile App

React Native / Expo app with a Spring Boot backend. The frontend supports:

- Web, mainly for fast feature testing.
- Android and iOS native builds for release.
- Local native development through Expo dev client.

The backend uses PostgreSQL, RabbitMQ, Redis, and Alibaba OSS. Docker Compose starts the app-side services and attaches the backend to the shared PostgreSQL network.

## Prerequisites

- Node.js and npm
- Java 21
- Docker Desktop / Docker Compose v2
- Android Studio emulator for Android testing
- Xcode on macOS for iOS testing
- EAS CLI for cloud builds/submission

## Environment Files

Create these files from the examples before running locally:

```bash
cp frontend/.env.example frontend/.env
cp backend/env.properties.example backend/env.properties
cp backend/.env.example backend/.env
cp infra/.env.example infra/.env
```

`frontend/.env`:

```env
BACKEND_BASE_URL=http://localhost:8080
ENABLE_LIBRE_TRANSLATE=false
```

For Android Emulator, use the host-loopback address instead:

```env
BACKEND_BASE_URL=http://10.0.2.2:8080
```

`backend/env.properties` is used when running the backend directly with Maven. `backend/.env` stores local Alibaba OSS credentials. `infra/.env` is used by Docker Compose and production-like tooling.

Do not commit real secrets, Google service files, EAS submit keys, OSS keys, database passwords, or mail passwords.

## Local Backend

Run Spring Boot directly:

```bash
cd backend
./mvnw spring-boot:run
```

On Windows:

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

The backend reads `backend/env.properties` through `spring.config.import=optional:file:env.properties`.

## Database Migrations

The schema is baselined with Flyway (`spring.flyway.baseline-on-migrate=true`):
existing databases are stamped at version 1 and skip `V1__baseline.sql`. Put any
**future** DDL in `backend/src/main/resources/db/migration/` as `V2__…`, `V3__…`
— do not rely on Hibernate `ddl-auto=update` for schema changes; it only ever
adds tables/columns and silently skips type changes. `ddl-auto=update` remains
enabled for now, alongside the idempotent startup runners in
`backend/src/main/java/com/fyp/backend/config/app/`.

## Docker Compose

The root Compose file starts RabbitMQ, Redis, and the backend. The backend also joins an external PostgreSQL network:

```yaml
networks:
  db:
    name: ${DB_NETWORK_NAME:-pingan-db-net}
    external: true
```

That external network must already contain the PostgreSQL service referenced by `DB_URL` in `infra/.env`, for example `pingan-care-postgres`.

Start the app-side services:

```bash
docker compose --env-file infra/.env up -d --build rabbitmq redis backend
```

Start LibreTranslate only when needed:

```bash
docker compose --env-file infra/.env --profile translation up -d libre
```

Seed or repair the admin user:

```bash
docker compose --env-file infra/.env --profile tools run --rm --build seed-admin
```

The seed tool is idempotent. Configure it in `infra/.env`:

```env
APP_SEED_ADMIN_EMAIL=sample@admin.com
APP_SEED_ADMIN_PASSWORD=change-me
APP_SEED_ADMIN_FIRST_NAME=John
APP_SEED_ADMIN_LAST_NAME=Doe
APP_SEED_ADMIN_RESET_PASSWORD=false
```

Production-like backend deployment uses `docker-compose.prod.yml` and requires `BACKEND_IMAGE`:

```bash
docker compose --env-file infra/.env -f docker-compose.prod.yml pull backend
docker compose --env-file infra/.env -f docker-compose.prod.yml up -d backend
```

## Frontend

Install dependencies:

```bash
cd frontend
npm install
```

Start the Expo dev server:

```bash
npm run start
```

Run web:

```bash
npx expo start --web -c
```

The `npm run web` script also exists, but it uses shell-style `export`; use the direct command above in PowerShell if needed.

## Native Development

Android:

```bash
cd frontend
npm run android
```

On Windows, if the normal Android command fails because the project path is too long, use:

```powershell
cd frontend
npm run android:windows
```

This maps `frontend` to a short drive path with `subst`, runs `expo run:android`, then removes the mapping. To choose a different drive:

```powershell
$env:PINGAN_ANDROID_DRIVE = "R:"
npm run android:windows
```

iOS:

```bash
cd frontend
npm run ios
```

## EAS Builds

EAS config lives in `frontend/eas.json`. Current profiles:

- `development`: dev client, internal distribution.
- `preview`: internal Android APK (arm64-v8a + armeabi-v7a only, with R8 minify + resource shrink to keep the download small).
- `production`: store/release build; versions come from `npm run update` (`appVersionSource: local`).

The EAS profiles currently point the app at:

```text
https://api.rn-app.pingan.org.sg
```

Common commands:

```bash
cd frontend
eas login
eas build --platform android --profile development
eas build --platform android --profile preview
eas build --platform ios --profile production
eas build --platform android --profile production
```

Submit profiles are configured for Android and iOS in `frontend/eas.json`. Required submit credentials must live under `frontend/secrets/` and must not be committed.

```bash
cd frontend
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

Android builds also need `frontend/google-services.json` or `GOOGLE_SERVICES_JSON` pointing to the file path expected by `app.config.js`.

## Versioning

`npm run update` bumps the version in every place the repo stores it, in
lockstep: `app.config.js` (Expo version, Android `versionCode`,
`ANDROID_VERSION_CODE`, iOS `buildNumber`), `package.json`, `package-lock.json`,
the native projects (`android/app/build.gradle`, iOS `Info.plist` +
`project.pbxproj`), and the backend in-app-update metadata in
`application.properties` (`latest-version-name` / `latest-version-code` for both
channels).

```bash
cd frontend
npm run update patch                 # 0.1.2 -> 0.1.3
npm run update minor                 # 0.1.2 -> 0.2.0
npm run update major                 # 0.1.2 -> 1.0.0
npm run update 1.2.3                 # set an explicit version
npm run update patch forced-update   # also raise min-supported so older installs are force-updated
npm run update -- patch -m "0.1.9: faster chat, bug fixes"
                                      # also update the in-app update message
npm run update -- patch -m "Faster chat, bug fixes" "聊天更流畅，修复若干问题"
                                      # English first, Chinese second
```

The Android version code is `major*10000 + minor*100 + patch` (so `0.1.3` -> `103`).

Bumping does **not** make the update prompt appear — see [Announcing a
Release](#announcing-a-release) below.

`forced-update` also has a `--forced-update` flag form, but note that `npm run`
strips `--`/`-` flags unless you separate them with `--` (e.g.
`npm run update -- patch --forced-update`) — the bare `forced-update` word above
avoids that. `-m` / `--message` updates the release notes shown in the Android
update dialog for both direct-download and Play channels. It takes the English
text first and, optionally, the Chinese translation as a second value; given
only one message, that text is used for both languages. A bump keyword, a flag
or `forced-update` is never read as the Chinese value, so
`npm run update -- -m "Bug fixes" patch` still bumps the patch version. Chinese
can also be set on its own with `--message-zh` / `-mz` (or `message-zh=…`, which
survives `npm run` without the `--`). Non-ASCII message text is stored as
`\uXXXX` escapes automatically, since Spring reads `.properties` as ISO-8859-1 —
raw Chinese typed straight into that file is served as mojibake. The script only
edits files; it does not commit or tag, and the backend must be redeployed for
new update metadata to take effect.

## Announcing a Release

The backend deploys the moment CI/CD runs, but a store build is not
downloadable until review passes — days later. So the backend tracks two
versions per channel, and only ever tells clients about the second:

| property | meaning | written by |
|---|---|---|
| `latest-version-*` | built and submitted | `npm run update` |
| `published-version-*` | installable right now | `npm run live` |

While `published-*` trails `latest-*`, no update is advertised and
`min-supported-version-code` is clamped to `published-*`. That clamp matters:
without it, `npm run update patch forced-update` would put every user behind a
**non-dismissable** dialog whose only button opens a store listing that still
serves the old build.

```bash
cd frontend
npm run live status     # what is built vs what is live, per channel
npm run live direct     # the APK is on the mirror — announce it
npm run live play       # Play review passed — announce it
npm run live all        # both channels
npm run live play 1.0.0 # pin one channel to an earlier release (rollback)
```

The channels are published separately because they go live at different times:
`direct` as soon as you upload the APK, `play` only after review. Redeploy the
backend after running it — like `npm run update` and `npm run dir-link`, this
only edits `application.properties`.

**Skipped versions need no special handling.** Releases are sparse — 1.0.0 ships,
1.0.1 and 1.0.2 get built but never go out, then 1.0.3 ships. Publishing always
means "whatever is built right now", so an unreleased build never becomes the
published one, and a user on 1.0.0 is offered 1.0.3 directly. Nothing compares
adjacent versions or walks a sequence; it is all one numeric `>`.

The one place this bites is the manual `npm run live <channel> <x.y.z>` form:
an earlier version number is *not* evidence that it ever shipped, and the script
keeps no publication history to check against. It warns when the version you name
is neither the built nor the live one, but only you can confirm that build is
really downloadable.

If a release is being held back, the backend says so once at startup:

```text
WARN  App update channel 'play' is holding back 1.0.4 (10004): published is 1.0.3 (10003).
```

## In-App Update Links

Android builds check the backend for a newer version and open a download link.
Because Google Play/Drive are blocked in China, the app serves a China mirror to
China-based devices (detected on-device by region/timezone) and the
international (Google) link to everyone else. `npm run dir-link` sets those
links and the China-mirror share password. If the China mirror is password-gated
(e.g. Lanzou), CN users get a confirmation that shows the password before they
are redirected.

Pass the flags after `--` (npm strips `--`/`-` flags otherwise). All are
optional; omitted values are left unchanged:

```bash
cd frontend
# -g / --google    international link (non-China devices)
# -c / --china     China-mirror link (China devices)
# -p / --password  China-mirror share password (shown to CN users before redirect)
npm run dir-link -- -g https://drive.google.com/… -c https://pan.example.cn/app.apk -p 518c
```

`-g`/`-c` must be `https` URLs. These values live in
`backend/src/main/resources/application.properties`, so redeploy the backend for
changes to take effect.

## Web Deployment

For Vercel / static web export:

```bash
cd frontend
npx expo export --platform web
```

Use `dist` as the output directory.

## Removed Legacy Notes

Old server-specific image push commands, SSH notes, and plaintext credentials are no longer part of the documented workflow. Use Docker Compose, EAS, and the secret files described above instead.
