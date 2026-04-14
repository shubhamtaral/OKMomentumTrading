# 🚀 OK Momentum Screener

> [!IMPORTANT]
> **EDUCATIONAL & STUDY PURPOSE ONLY**
> This project is a quantitative research tool designed to demonstrate technical analysis patterns and the Oliver Kell strategy framework. It is NOT a financial advisory service. No information here should be construed as investment advice. Trading stocks involves high risk.

A production-grade, quant-style stock screener designed to identify high-momentum trading setups based on the **Oliver Kell "Power Play"** strategy. Built with performance and precision in mind, targeting NSE (National Stock Exchange of India) stocks.

![Oliver Kell Cycle of Price](Cycle-of-Price-Oliver-Kell.png)

---

## 🎯 Project Objective

To build an intelligent advisory terminal that filters out market noise and surfaces stocks with high institutional conviction. The system precomputes signals using a dedicated data pipeline to ensure sub-500ms response times.

### Key Strategy Components:
*   **The Box Theory:** Identifying tight consolidation ranges before explosive moves.
*   **Volume Conviction:** Validating breakouts with 2x-3x average volume expansion.
*   **Moving Average Alignment:** Ensuring stocks are in a clear uptrend (EMA10 > EMA20 > EMA50 > EMA200).
*   **Relative Strength:** Prioritizing stocks outperforming the benchmark (NIFTY 50) and trading near 52-week highs.

---

## ✨ Features

*   **Automated Data Pipeline:** Scheduled ingestion of NSE symbols, OHLC data, and technical indicator calculation.
*   **Signal Engine:** Precomputes "Power Play", "Wedge Breakout", and "EMA Crossback" patterns.
*   **AI-Powered Narratives:** Generates quant-grade research reports using OpenAI/OpenRouter (with rule-based fallback).
*   **Interactive Dashboard:** High-performance React UI for scanning and monitoring signals.
*   **SQLite Persistence:** Fast, local indexing with `better-sqlite3` for efficient data access.

---

## 🏗️ Project Structure

```text
/screener
├── /db         # Database schema, migrations, and SQLite access logic
├── /services   # Business logic: technical indicators, signal algorithms, AI narratives
├── /jobs       # Background workers: symbol ingestion, OHLC fetching, cron scheduling
├── /routes     # Express API endpoints
├── /frontend   # React (Vite) UI with Tailwind CSS
└── server.js   # Application entry point
```

---

## 🛠️ Tech Stack

*   **Backend:** Node.js, Express, PostgreSQL (via `pg`)
*   **Frontend:** React, Vite, Tailwind CSS
*   **AI:** OpenAI API / OpenRouter (LLM integration)
*   **Data Source:** Yahoo Finance (via `axios`)
*   **Automation:** node-cron

---

## 🚀 Setup & Installation

### 1. Prerequisites
*   Node.js (v18.0.0 or higher)
*   PostgreSQL database (Local or Managed like Supabase/Neon)
*   An API Key for OpenAI or OpenRouter (optional for AI reports)

### 2. Backend Setup
```bash
cd screener
npm install
```

### 3. Environment Configuration
Copy the `.env.example` to `.env` and fill in the required fields:
```bash
cp .env.example .env
```
Key variables:
- `DATABASE_URL`: Your PostgreSQL connection string.
- `OPENAI_API_KEY`: Your AI api key.

### 4. Initialize Database & Run Full Data Pipeline
```bash
npm run pipeline         # Auto-runs: init-db -> ingest-symbols -> ingest-ohlc -> generate-signals
```
*(Takes 2-5 minutes depending on symbol count)*

### 5. Frontend Setup
```bash
cd frontend
npm install
```

---

## 🏃 Running the Application

### Development Mode
**Start Backend:**
```bash
cd screener
npm run dev
```
*API will be available at: http://localhost:3000*

**Start Frontend:**
```bash
cd screener/frontend
npm run dev
```
*UI will be available at: http://localhost:5173*

---

## 🐳 Docker Implementation

The project is fully containerized using Docker and Docker Compose for easy deployment.

### 1. Requirements
*   Docker and Docker Compose installed.

### 2. Running with Docker Compose
From the root directory, run:
```bash
docker-compose up --build
```

*   **UI (Nginx):** http://localhost:80
*   **API (Node.js):** http://localhost:3000

### 3. Initialize Data (Inside Docker)
After the containers are up, run the full ingestion pipeline:
```bash
docker exec -it ok-momentum-api npm run pipeline
```

### 4. Key Components
*   **Persistence:** The SQLite database is persisted in a local `./data` volume.
*   **Reverse Proxy:** Nginx handles routing requests to the API, avoiding CORS issues.
*   **Health Checks:** The UI service waits for the API to be healthy before starting.

---

## 📊 Scoring System (The "Kell Score")

Every stock is evaluated against a multi-point checklist:
*   **+2 pts:** Tight Base / Consolidation
*   **+2 pts:** Price Breakout (Horizontal/Wedge)
*   **+2 pts:** Volume Expansion (>2x avg)
*   **+1 pt:** RSI > 60 (Momentum confirmation)
*   **+1 pt:** Near 52-week High
*   **+1 pt:** Relative Strength alignment

**Qualities:**
*   **A+:** High Conviction (Institutional move)
*   **A:** Solid Setup
*   **B:** Watchlist / Speculative

---

## 📝 License
ISC License. Built for educational and professional trading analysis.

> [!WARNING]
> Trading stocks involves significant risk. This tool is for educational and research purposes only. Always consult with a certified financial advisor before making investment decisions.
