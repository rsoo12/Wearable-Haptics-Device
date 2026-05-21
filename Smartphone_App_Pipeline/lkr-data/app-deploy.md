# LKR Data — Deployment & run guide

Instructions for running and deploying the mobile app in the current repository layout.

---

## Where this app lives in the repo

```
Wearable-Haptics-Device/
├── Wearable/                              # CircuitPython firmware (foot IMU + shank haptics)
├── Laptop_Pipeline/                       # Python real-time pipeline (laptop ↔ BLE)
├── Smartphone_App_Pipeline/
│   └── lkr-data/                          # ← this Expo app (you are here)
│       ├── app/                           # screens (Expo Router)
│       ├── lib/                           # on-device FPA + API client
│       ├── backend/                       # optional AWS SAM stack
│       ├── app-overview.md                # architecture & screen reference
│       └── app-deploy.md                  # this file
└── Data_Processing/                       # offline analysis scripts
```

All commands below assume your shell is in **`Smartphone_App_Pipeline/lkr-data`** unless noted otherwise.

```bash
cd Smartphone_App_Pipeline/lkr-data
```

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Node.js](https://nodejs.org/) 18+ | `npm install`, Expo CLI |
| Physical iPhone or Android phone | BLE (`react-native-ble-plx`) does not work in web/simulator-only flows |
| Wearable MCUs flashed & powered | See [Wearable/README.md](../../Wearable/README.md) |
| (Optional) AWS CLI + SAM CLI | Session History tab / cloud sync |

---

## Install dependencies

```bash
cd Smartphone_App_Pipeline/lkr-data
npm install
```

---

## Run in development (Metro)

```bash
npx expo start
```

- Scan the QR code with **Expo Go** (quick try) or a **development build** (recommended for reliable BLE).
- Grant **Bluetooth** permissions when prompted.
- Default tab is **Active Session** (auto-scan for `CIRCUITPY*` devices).

**Reload after UI changes:** shake the device → **Reload** (or press `r` in the Metro terminal).

---

## Development build on a physical iOS device

BLE and native modules are more reliable with a dev client than Expo Go alone.

```bash
cd Smartphone_App_Pipeline/lkr-data

npx expo install expo-dev-client
npx expo prebuild
open ios/lkrdata.xcworkspace   # name may match slug in app.json
```

In a **second** terminal (same directory):

```bash
npx expo start --dev-client
```

In Xcode:

1. Open the `.xcworkspace` (not `.xcodeproj`).
2. **Signing & Capabilities** → enable **Automatically manage signing**.
3. Choose your **Team** (Personal Team works for local testing).
4. Set a **unique bundle identifier** if needed.
5. **Run** (⌘R) on your connected iPhone.

In the app:

- If the bundle does not load, enter the Metro URL manually.
- Approve Bluetooth (and any other) permissions, then reload.

`app.json` already includes iOS Bluetooth usage strings for the wearable.

---

## iOS Simulator via EAS (no BLE hardware)

Use this only for UI work; full gait/BLE testing requires a real device.

1. Install tooling: Xcode, Xcode Command Line Tools, iOS Simulator, [Watchman](https://facebook.github.io/watchman/) (`brew install watchman`).
2. Install EAS CLI: `npm install -g eas-cli`
3. Log in: `eas login`
4. From `Smartphone_App_Pipeline/lkr-data`:

   ```bash
   eas build:configure
   ```

5. In `eas.json`, ensure the iOS development profile targets the simulator, for example:

   ```json
   "build": {
     "development": {
       "developmentClient": true,
       "distribution": "internal",
       "ios": {
         "simulator": true
       }
     }
   }
   ```

6. Build:

   ```bash
   eas build --platform ios --profile development
   ```

Install the artifact on the simulator per [Expo dev builds](https://docs.expo.dev/develop/development-builds/introduction/).

---

## Optional: AWS backend (History tab)

The app processes FPA **on the phone**. AWS only stores **finished** session summaries (CSV aggregates)—not live IMU packets.

### Deploy SAM stack

From the backend folder (still under the app tree):

```bash
cd Smartphone_App_Pipeline/lkr-data/backend

aws configure sso
aws sso login --profile <profile-name>

# Optional: clear stale env vars before SSO
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE

aws sts get-caller-identity --profile <profile-name>

sam build
sam deploy --guided --profile <profile-name>
```

Note the **`ApiBaseUrl`** output (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com/prod`).

See [backend/README.md](backend/README.md) for endpoint details and curl examples.

### Point the app at the API

In **`Smartphone_App_Pipeline/lkr-data`** (not `backend/`):

```bash
export EXPO_PUBLIC_API_BASE_URL="https://abc123.execute-api.us-east-1.amazonaws.com/prod"
npx expo start
```

Without this variable, **Active Session** and CSV export still work; **History** will error when loading summaries.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | No (yes for History) | API Gateway base URL from `sam deploy`, no trailing slash |

---

## Related pipelines (not deployed from this folder)

| Path | Role |
|------|------|
| [Laptop_Pipeline/](../../Laptop_Pipeline/) | Same gait/FPA logic on a laptop; configure via `config.json` |
| [Wearable/](../../Wearable/) | Firmware for foot IMU stream and shank vibration |
| [Data_Processing/](../../Data_Processing/) | Offline FPA analysis after collection |

Laptop haptic commands are `"1"` / `"2"` (driver only). The app may still log `"112"` / `"212"` in CSV; shank firmware uses the **first character** of the UART string.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| No devices found | MCUs powered, `CIRCUITPY` name prefix, Bluetooth on, using physical phone |
| History empty / API errors | `EXPO_PUBLIC_API_BASE_URL` set; SAM deployed; session ended with **Disconnect** on Active Session |
| Changes not visible | Metro reload or dev-client rebuild after native changes |
| Wrong directory | Must run `npm` / `expo` from `Smartphone_App_Pipeline/lkr-data` |

For screen-level behavior and file layout, see [app-overview.md](app-overview.md).
