# MedFlow · Hospital Resource Management Simulator

MedFlow is a high-fidelity, deterministic, event-driven hospital resource management simulator and real-time clinical command desk. It orchestrates patient journeys from emergency arrival and multi-factor triage prioritization through atomic resource allocation, clinical treatment, discharge, and live analytical telemetry.

```
       [ Poisson Arrival Generator ]
                     │
                     ▼
           [ Department Queues ]
                     │
                     ▼
           [ Priority Engine ] ◄── (Urgency, Wait Penalties, Scarcity, MDP)
                     │
                     ▼
         [ Atomic Resource Manager ] ◄── (Beds, ICU, OTs, Doctors, Nurses)
              │             │
        (Rollback)     (Committed)
              │             ▼
              │     [ Clinical Treatment ]
              │             │
              ▼             ▼
       [ Retrial Queue ]   [ Discharge & Metrics ]
                                  │
                                  ▼
                   [ FastAPI Server & WebSocket ]
                                  │
                                  ▼
             [ React + TypeScript + Tailwind Command Desk ]
```

---

## Key Capabilities

- **Atomic All-or-Nothing Resource Allocation**: Eliminates partial reservation deadlocks. If a surgical patient obtains an Operating Theatre but lacks an anesthesiologist or nurse, all provisional reservations roll back atomically.
- **Event-Driven Continuous Simulation Clock**: Advances dynamically to the next scheduled arrival or departure rather than iterating over artificial fixed-time ticks.
- **4 Clinical Triage & Allocation Policies**:
  1. `urgency_only`: Baseline triage prioritizing clinical acuity exclusively.
  2. `wait_aware`: Blends acuity with wait penalties to prevent starvation of lower-acuity patients.
  3. `resource_aware`: Penalizes requests for currently scarce assets to maximize throughput.
  4. `mdp_optimal`: Dynamic value-iteration Markov Decision Process policy.
- **Rigorous Mathematical Validation Layer (`medflow.math`)**:
  - **Absorbing Markov Chains**: Computes analytical expected steps to absorption across clinical stages.
  - **Queueing Theory**: Erlang-C delay probabilities and Erlang-B ICU blocking predictions.
  - **Little's Law Validation**: Automated consistency checks comparing simulated occupancy vs. $\lambda \cdot W$.
  - **Monte Carlo Verification**: 30 seeded replications with mean, standard deviation, and 95% Confidence Intervals.
- **Injected Operational Shocks**:
  - 🚨 **Emergency Surge**: Instant $2\times$ arrival multiplier.
  - 👥 **Staff Shortage**: Instant $25\%$ reduction of on-duty nurses.
  - ⚠️ **Asset Failure**: Explicit failure taking specific resources offline into maintenance.
- **Real-Time Command Desk**:
  - React 18 + TypeScript + Tailwind CSS powered by Vite.
  - Live WebSocket telemetry (`/ws/live`) with TanStack Query polling fallback.
  - Live triage queue with wait timers, individual asset state tiles (🟩 available, 🟥 occupied, ⬛ down), dual Recharts, and a multilingual clinical copilot.

---

## Quick Start

### Prerequisites

- **Python**: 3.11 or higher
- **Node.js**: 18 LTS or higher
- **OS**: Windows, macOS, or Linux

### Running with One Command (Windows)

Double-click or run [run.bat](file:///c:/Users/Kishan%20DV/OneDrive/Desktop/Medflow/run.bat):

```bat
.\run.bat
```

This script automatically:
1. Creates and activates the Python virtual environment (`venv`).
2. Installs backend dependencies from `requirements.txt`.
3. Runs the test suite (`pytest`).
4. Installs frontend dependencies in `dashboard/` (`npm install`).
5. Launches the **FastAPI backend** on `http://127.0.0.1:8000`.
6. Launches the **React Command Desk** on `http://localhost:5173`.

### Running on Linux / macOS

```bash
# Set up Python environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run tests
pytest tests -q

# Set up and build dashboard
cd dashboard && npm install && npm run dev &
cd ..

# Launch API backend
PYTHONPATH=src uvicorn medflow.api.main:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

---

## Access Points

| Service | URL | Description |
|---|---|---|
| **Command Desk** | [http://localhost:5173](http://localhost:5173) | Interactive React dashboard |
| **Interactive API Docs** | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Swagger UI for all REST & WebSocket routes |
| **Alternative Docs** | [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) | ReDoc API documentation |

---

## Headless CLI Tools

MedFlow includes command-line utilities for automated headless runs and policy benchmarking:

### 1. Headless Simulation Run
Run a full deterministic shift and generate console & file reports:

```powershell
# Windows
$env:PYTHONPATH="src"; python scripts/run_simulation.py --seed 42 --duration 480

# Linux / macOS
PYTHONPATH=src python scripts/run_simulation.py --seed 42 --duration 480
```
*Outputs are saved to `logs/reports/report.json` and `logs/reports/patients.csv`.*

### 2. Monte Carlo Policy Comparison
Execute 30 seeded replications comparing all 4 allocation strategies:

```powershell
# Windows
$env:PYTHONPATH="src"; python scripts/run_strategy_comparison.py

# Linux / macOS
PYTHONPATH=src python scripts/run_strategy_comparison.py
```

### 3. Automated Test Suite
Run the verification suite:

```powershell
pytest -v
```

---

## Repository Structure

```
Medflow/
├── config/
│   └── config.yaml             # Capacities, arrival rates, service times, weights, SLAs
├── dashboard/                  # React 18 + TypeScript + Tailwind CSS command desk
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx             # Main dashboard layout and scenario orchestration
│       ├── api/                # API client and TypeScript schema definitions
│       ├── components/         # QueuePanel, ResourceGrid, AnalyticsPanel, Controls, etc.
│       ├── hooks/              # WebSocket & TanStack Query polling hooks
│       └── store/              # Zustand global client store
├── logs/
│   └── reports/                # Exported simulation metrics and patient CSVs
├── scripts/
│   ├── run_simulation.py       # Headless shift runner script
│   └── run_strategy_comparison.py # Headless Monte Carlo benchmark runner
├── src/
│   └── medflow/
│       ├── api/                # FastAPI app, CORS middleware, WebSocket fanout, schemas
│       ├── core/               # Allocator, Clock, Models, Priority Engine, Resource Manager
│       ├── math/               # Erlang-B/C, Markov chains, MDP policy, Monte Carlo, validation
│       ├── reporting/          # Summary metrics, report generator, CSV exporters
│       ├── simulation/         # Engine, arrival generator, metrics collector, shocks
│       └── utils/              # Configuration loader
├── tests/                      # Pytest automated test suite
├── pytest.ini                  # Pytest configuration (pythonpath = src)
├── requirements.txt            # Python dependencies (zero Streamlit remnants)
├── run.bat                     # Windows launch automation script
└── run.sh                      # Unix launch script
```

---

## API Endpoints

### Simulation Operations
- `POST /simulation/start`: Initialize/re-seed simulation with selected strategy.
- `POST /simulation/step`: Step forward to the next scheduled event.
- `POST /simulation/run`: Advance simulation by $N$ minutes headlessly.
- `POST /simulation/reset`: Reset simulation to initial baseline state.
- `GET /simulation/state`: Retrieve current presentation-safe snapshot.

### Operational Shocks
- `POST /scenario/surge`: Apply arrival rate multiplier ($2\times$ surge).
- `POST /scenario/shortage`: Take percentage of specified resource offline.
- `POST /scenario/fail-resource`: Place specific resource into maintenance.

### Strategy & Telemetry
- `POST /strategy/switch`: Switch active allocation policy dynamically.
- `POST /strategy/compare`: Execute 30 Monte Carlo runs and return comparative statistics.
- `GET /metrics/utilization`: Unit utilization percentages.
- `GET /metrics/wait-times`: Wait-time breakdowns by clinical urgency.
- `GET /math/benchmarks`: Theoretical Erlang-C and Erlang-B analytical benchmarks.
- `GET /math/validation`: Validation report comparing empirical results to theory.
- `WebSocket /ws/live`: Real-time state push channel.

---

## Configuration

All clinical parameters are externalized in [config/config.yaml](file:///c:/Users/Kishan%20DV/OneDrive/Desktop/Medflow/config/config.yaml):
- **Department Capacities**: Beds, ICU beds, Operating Theatres, Doctors, Nurses, Ambulances.
- **Arrival Distributions**: Log-normal parameters per department and hourly rates.
- **Service Durations**: Exponential treatment durations per urgency level.
- **Urgency Weights**: Acuity score multipliers (`CRITICAL: 100`, `HIGH: 60`, `MODERATE: 30`, `LOW: 10`).
- **SLAs**: Maximum acceptable waiting times before breach.
- **Math Layer Tolerances**: Convergence criteria and allowable theoretical variation thresholds.

Zero magic numbers exist in the codebase.

---

## Text-to-Speech & Voice Copilot (Sarvam AI Bulbul:v3)

MedFlow features an optional, privacy-preserving, spoken clinical voice copilot powered by Sarvam AI (`bulbul:v3`).

### Environment Variables
Configure these variables in your `.env` file:
```bash
# Feature Flag (Default: false)
VOICE_ENABLED=true

# Sarvam AI API Key (Never exposed to frontend)
SARVAM_API_KEY=your_sarvam_api_key_here

# Default Voice Persona ("shubh" or "simran")
DEFAULT_VOICE=shubh
```

### Endpoints
- `GET /tts/config`: Returns voice service status (`enabled: boolean`), available voice personas, default voice, and character limits.
- `POST /tts/speak`: Synthesizes spoken audio bytes (`audio/wav`) for verified session message IDs or server-redacted text with pace clamping (`[0.5, 2.0]`), IP sliding-window rate limiting (60 req/min), and daily caps (1000 req/day).

### Privacy & Clinical Safeguards
- **Server-Side Redaction**: Automatic regex scrubbing of MRNs, patient full names, phone numbers, and dates of birth before audio synthesis.
- **Log Isolation**: Strictly logs latency, response status, and byte sizes; zero clinical text or prompts are logged.
- **Session-Bound Message Verification**: Cross-session message ID access is rejected with `404 Not Found`.

### How to Add a New Voice
1. In `src/medflow/services/tts_service.py`, add the new speaker ID to `ALLOWED_VOICES` (e.g. `ALLOWED_VOICES = {"shubh", "simran", "new_speaker"}`).
2. In `src/medflow/api/tts_router.py`, add the voice descriptor to the `GET /tts/config` payload.
3. The frontend dynamically discovers available voices from `/tts/config` and renders them in the voice selector.

---

## Running on Android

MedFlow includes a Capacitor wrapper configured for Android (`com.medflow.app`), allowing you to test clinical surveillance and telemetry natively on Android phones and emulators.

### Prerequisites
- **Android Studio** (Hedgehog or newer) with Android SDK and platform tools.
- **Java Development Kit (JDK 17+)**.
- **Node.js 18+** & **Python 3.11+**.

### 1. Build and Sync
Inside the `dashboard/` directory:
```bash
cd dashboard
npm run cap:sync      # Compiles TypeScript/Vite bundle and copies assets into android/
npm run cap:android   # Syncs assets and launches Android Studio
```

### 2. Testing with Android Emulator (10.0.2.2)
The standard Android Virtual Device (AVD) emulator accesses the host computer's localhost via the special virtual loopback IP `10.0.2.2`.
1. Copy or link `.env.android` to `.env` in `dashboard/`:
   ```bash
   VITE_API_URL=http://10.0.2.2:8000
   ```
2. Start the backend bound to all network interfaces:
   ```bash
   python -m uvicorn medflow.api.main:app --host 0.0.0.0 --port 8000 --reload
   ```
3. In Android Studio, select your emulator and click **Run ▶**.

### 3. Testing on a Physical Android Device (LAN Wi-Fi)
1. Find your computer's local IP address:
   - Windows: Run `ipconfig` (e.g., `192.168.0.110`)
   - macOS/Linux: Run `ifconfig` or `ip a`
2. Set `VITE_API_URL` to your LAN IP in `dashboard/.env`:
   ```bash
   VITE_API_URL=http://192.168.0.110:8000
   ```
3. Run `npm run cap:sync` inside `dashboard/`.
4. **Firewall & Binding**:
   - Ensure `run.bat` or `uvicorn` is started with `--host 0.0.0.0` (not `127.0.0.1`).
   - If Windows Defender Firewall blocks incoming connections on port `8000`, add an inbound rule or allow Python when prompted.
5. Connect your Android phone to the **same Wi-Fi network**, enable **USB Debugging** in Developer Options, and deploy from Android Studio.

### 4. Security & Privacy
- **Zero Frontend Secrets**: API keys (such as `SARVAM_API_KEY`) and server secrets are strictly confined to the backend Python environment (`.env`). They are never bundled or exposed in the client-side JavaScript bundle.
- **Cleartext Policy**: `capacitor.config.ts` enforces `cleartext: true` strictly in development (`CAPACITOR_ENV !== 'production'`); production builds mandate secure HTTPS/WSS endpoints.
- **Persistent Offline Storage**: User sessions (`medflow_session_id`) and voice preferences (`medflow_tts_voice`, `medflow_tts_autoplay`) are safely persisted across app reboots via WebView `localStorage`.

