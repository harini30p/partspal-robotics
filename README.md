# PartsPal — Never lose an Arduino again.

PartsPal is a full-stack robotics lab inventory and lending management application. It helps a club track parts and custom kits, record who has borrowed them, monitor stock, and print QR asset labels.

## Live Demo

- [Frontend](https://partspal-eight.vercel.app/)
- [Backend API](https://partspal-api.onrender.com)
- [Health check](https://partspal-api.onrender.com/api/health)

## Key features

- Add and browse inventory parts, with search and category filtering.
- View total and available quantities, including low-stock and out-of-stock warnings.
- Check out and return individual parts.
- Create custom kits from inventory parts and check out or return a kit.
- See active checkouts in the **Who Has What** view, with overdue highlighting.
- Search member issue history by name or registration number.
- Generate printable QR labels for parts and kits.

## Tech stack

- **Frontend:** React, Vite, `qrcode.react`
- **Backend:** Node.js, Express
- **Database:** SQLite using `better-sqlite3`
- **Communication:** REST API over HTTP
- **Version control:** Git and GitHub

## Architecture

For local development, the React/Vite frontend in `frontend/` calls the Express API in `backend/` at `http://localhost:5000`. The deployed frontend runs on Vercel, and the deployed backend/API runs on Render. The API validates requests and reads or updates the SQLite database through `better-sqlite3`.

```text
React + Vite frontend
        │ HTTP / JSON
        ▼
Express REST API (port 5000)
        │ better-sqlite3
        ▼
SQLite database (backend/partspal.db)
```

## Project structure

```text
partspal-new/
├── backend/
│   ├── database.js          # SQLite connection and table initialization
│   ├── server.js            # Express app and API route mounting
│   ├── routes/
│   │   ├── issues.js        # Issue, return, and issue-list routes
│   │   ├── kits.js          # Kit list and creation routes
│   │   └── parts.js         # Inventory list and creation routes
│   ├── package.json
│   └── partspal.db          # SQLite database file used by the backend
└── frontend/
    ├── src/
    │   ├── components/
    │   │   └── QRLabel.jsx  # Reusable QR label dialog and print action
    │   ├── services/
    │   │   └── api.js       # Frontend REST API helpers
    │   ├── App.jsx          # Dashboard and inventory, kits, and lending UI
    │   ├── index.css        # Dashboard, responsive, and print styles
    │   └── main.jsx         # React entry point
    ├── index.html
    ├── package.json
    └── vite.config.js
```

The database module creates the `parts`, `kits`, `kit_parts`, and `issues` tables if they do not already exist.

## REST API

All API routes are mounted by the Express server at `http://localhost:5000`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Return `{ "status": "ok", "message": "PartsPal API is running" }`. |
| `GET` | `/api/parts` | Return `{ "parts": [...] }`, including each part's ID, name, category, total quantity, and available quantity. |
| `POST` | `/api/parts` | Create a part. JSON body: `{ "name": "Arduino Uno", "category": "Microcontrollers", "total_quantity": 5 }`. Returns `{ "part": ... }`. |
| `GET` | `/api/kits` | Return `{ "kits": [...] }`; each kit includes its description and component list. |
| `POST` | `/api/kits` | Create a kit. JSON body: `{ "name": "Robot Kit", "description": "Optional description", "parts": [{ "part_id": 1, "quantity": 2 }] }`. `description` may be omitted or empty. Returns `{ "kit": ... }`. |
| `GET` | `/api/issues` | Return all issues, newest first, as `{ "issues": [...] }`. |
| `GET` | `/api/issues?status=issued` | Return active issues. |
| `GET` | `/api/issues?status=returned` | Return returned issues. |
| `POST` | `/api/issues` | Check out individual parts. JSON body: `{ "part_id": 1, "member_name": "Alex Morgan", "registration_number": "24RBT018", "due_date": "2026-12-31", "quantity": 1 }`. |
| `POST` | `/api/issues/kit` | Check out a kit. JSON body: `{ "kit_id": 1, "member_name": "Alex Morgan", "registration_number": "24RBT018", "due_date": "2026-12-31" }`. A kit checkout represents one kit. |
| `PATCH` | `/api/issues/:id/return` | Return an active issue identified by its ID. No request body is required. |

Issue responses include the issue and kit/part IDs and names, member name, registration number, due date, issue timestamp, return timestamp, status, and quantity. The issue creation endpoints return `{ "issue": ... }` with HTTP `201`; part and kit creation return their resources under `part` and `kit`, respectively, also with HTTP `201`.

The API validates required names and IDs, positive issue and kit-component quantities, and available stock. Invalid requests return an `error` message; unavailable kit checkout responses may also include `unavailable_parts`.

## Setup and installation (Windows / PowerShell)

Install a supported Node.js release and npm before starting. There is no root-level `package.json`; install and run each package separately.

### 1. Install backend dependencies and start the API

In a PowerShell window:

```powershell
cd .\backend
npm install
npm run dev
```

The `dev` script runs `nodemon server.js`. The API listens on port `5000`. On startup, the backend opens `backend/partspal.db` and initializes missing tables.

### 2. Install frontend dependencies and start Vite

In a second PowerShell window, from the repository root:

```powershell
cd .\frontend
npm install
npm run dev
```

Open the local URL printed by Vite. Keep the backend running in the first window; the frontend API service uses `http://localhost:5000`.

### Available frontend commands

Run these from `frontend/`:

```powershell
npm run dev
npm run build
npm run lint
npm run preview
```

The backend package defines `npm run dev`. Its `npm test` script is only a placeholder that exits with an error; no backend test suite is configured.

## Typical workflow

1. Add inventory parts and quantities.
2. Search or filter inventory and check availability.
3. Create a custom kit from one or more existing parts.
4. Check out a part or kit to a member with a due date.
5. Monitor active checkouts and overdue items in **Who Has What**.
6. Record a return and review the member's issue history.
7. Print QR labels to identify parts and kits.

## Stock safety

Kit checkout checks the availability of every component before deducting stock. The component deductions and issue record are performed inside a `better-sqlite3` transaction. If validation or a stock update fails, the transaction rolls back, so a failed kit checkout cannot leave inventory partially deducted. Returning a kit also restores its component stock transactionally.

## QR labels

QR codes are generated in the browser as SVG using `qrcode.react`. The payload is exactly `part:<id>` for a part and `kit:<id>` for a kit. Labels show the item name and a readable identifier (`PART-<id>` or `KIT-<id>`). The print stylesheet configures an 80 mm × 48 mm label page and hides the dashboard UI while printing.

The QR payload identifies the item; QR scanning to navigate to an item page is not implemented.

## Screenshots

- **Dashboard / Inventory:**
 <img width="1901" height="867" alt="image" src="https://github.com/user-attachments/assets/6c4db4c9-7ed8-4236-b20d-0f6af25e434c" />

- **Custom Kits:**
 <img width="1882" height="796" alt="image" src="https://github.com/user-attachments/assets/45fb164f-6932-4bfe-af63-5ad2df3d5542" />

- **Issues / Who Has What:**
 <img width="1892" height="866" alt="image" src="https://github.com/user-attachments/assets/985b240d-538e-45a6-9ec1-b2230dbc2b7f" />

- **QR Label:**
 <img width="1897" height="858" alt="image" src="https://github.com/user-attachments/assets/32cc1718-405d-4c3c-b332-03290aadf5d3" />




## Testing and verification

The frontend provides `npm run lint` and `npm run build`; both have been run successfully during implementation. There is no configured automated frontend or backend workflow test suite. The backend's `npm test` command is a placeholder, not a test runner.

## How I Used AI

AI assistance supported implementation work such as scaffolding, debugging, validation, UI improvements, and documentation. I handled the project scope, feature decisions, testing, and final verification.

## Future ideas

These are possible future improvements and are not current features:

- Scan a QR code to open the corresponding item page.
- Add authentication and role-based access.
- Add inventory and lending analytics.

## Project status

PartsPal is a medium-level full-stack software project for robotics lab inventory and lending management. It currently includes inventory, custom kits, checkout and return tracking, member issue history, stock warnings, and printable QR labels.
