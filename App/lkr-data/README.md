# lkr-data

A React Native (Expo) app for real-time gait analysis and haptic feedback with the wearable haptics device.

---

## What the App Does

The app connects to the wearable device over Bluetooth Low Energy (BLE) and provides real-time foot progress angle (FPA) monitoring and haptic feedback during walking sessions.

### Key Features

- **BLE Connection** — Scans for and connects to the wearable MCU (`CIRCUITPY`) via the Nordic UART Service. Supports a dual-device setup (one sensor unit, one haptic feedback unit).
- **Live IMU Processing** — Receives 6-axis IMU data (accelerometer + gyroscope) from the shank-mounted sensor at ~180 Hz and computes FPA per gait cycle directly on the phone.
- **Calibration** — A 60-second baseline walk establishes the user's natural FPA reference. The first 7 steps are discarded to allow for a steady gait.
- **Automatic Haptic Feedback** — Triggers vibration commands to the wearable when FPA deviates from the calibrated baseline:
  - **Toe-in** (< −9° from baseline): activates driver 2
  - **Toe-out** (> −1° from baseline): activates driver 1
- **Session Logging** — Records per-step data (FPA, step number, sensor rate, commands sent, raw IMU values) to a CSV file that can be exported via the share sheet.
- **Session History** *(optional, requires backend)* — Uploads completed session summaries to AWS and displays historical FPA trends and gait consistency scores.

### Screens

| Tab | Description |
|-----|-------------|
| **Active Session** | Real-time BLE connection, live FPA chart, step count, calibration controls |
| **FPA** | On-device FPA processing with detailed per-step output |
| **History** | Past session summaries with FPA trend charts (requires backend) |
| **Insights** | Gait consistency scores and recommendations based on FPA variability |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Expo Go](https://expo.dev/go) installed on your iOS or Android phone
- The phone and wearable device must be in Bluetooth range

### Install Dependencies

From the `App/lkr-data` directory:

```bash
npm install
```

### Run the App

```bash
npx expo start
```

Scan the QR code with:
- **iOS** — the Camera app (opens in Expo Go)
- **Android** — the Expo Go app directly

The app will prompt for Bluetooth permissions on first launch — these are required for BLE communication with the wearable.

### Backend Setup (Optional)

Session history and cloud sync require an AWS backend. Skip this if you only need live sessions and local CSV export.

1. Deploy the backend:

   ```bash
   cd backend
   sam build
   sam deploy --guided
   ```

2. Copy the `ApiBaseUrl` from the deploy output and set it as an environment variable before starting the app:

   ```bash
   export EXPO_PUBLIC_API_BASE_URL="https://<your-api-id>.execute-api.us-east-1.amazonaws.com/prod"
   npx expo start
   ```

See [backend/README.md](backend/README.md) for full deployment details.
