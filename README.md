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
```

The Android version code is `major*10000 + minor*100 + patch` (so `0.1.3` -> `103`).

`forced-update` also has a `--forced-update` flag form, but note that `npm run`
strips `--`/`-` flags unless you separate them with `--` (e.g.
`npm run update -- patch --forced-update`) — the bare `forced-update` word above
avoids that. `-m` / `--message` updates the release notes shown in the Android
update dialog for both direct-download and Play channels, in both English and
Chinese metadata entries. Non-ASCII message text (e.g. Chinese) is stored as
`\uXXXX` escapes automatically, since Spring reads `.properties` as ISO-8859-1.
The script only edits files; it does not commit or tag, and the backend must be
redeployed for new update metadata to take effect.

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
