# WGIP Architecture

## Overview

WGIP consists of six primary components.

1. Collector
2. Import Engine
3. Database
4. Backend API
5. Frontend Dashboard
6. Reporting

---

## Architecture

Raspberry Pi

↓

DragonOS

↓

Kismet

↓

.kismet Database

↓

WGIP Import Engine

↓

PostgreSQL + PostGIS

↓

FastAPI

↓

React Dashboard

↓

GIS

Analytics

Reports

Timeline

---

## Components

### Collector

Responsible for collecting wireless observations.

Hardware

- Raspberry Pi
- Alfa Adapter
- GPS

Software

- DragonOS
- Kismet

---

### Import Engine

Imports every observation into PostgreSQL.

Responsibilities

- Read Kismet database
- Parse devices
- Parse clients
- Parse GPS
- Store observations

---

### Database

Stores

- Surveys
- Access Points
- Clients
- Historical Observations
- GPS Tracks

---

### Backend

Provides REST APIs.

---

### Frontend

Provides dashboard visualization.

---

### Reporting

Produces PDF and CSV reports.