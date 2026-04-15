# DealPad - NextGenApp Pricing & Scoping 2.0

## Overview
DealPad is a full-stack web application replacing Excel-based pricing and scoping workbooks for professional services firm Armanino LLP's Quote-to-Cash workflow. It demonstrates 5 AI-powered use cases across the entire vertical stack with a modern UX inspired by Ramp.com and Gusto.com.

## Current State
- **Phase**: Working PoC with 5 AI use cases
- **Active Features**: Dashboard, Deal List, 8-step Deal Wizard, Rate Card Admin, Scope Catalog Admin
- **AI Features**: Deal Similarity, Effort Estimation, Margin Advisor, Scenario Recommendation, Risk Summary

## Architecture
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS (client/src/)
- **Backend**: Express.js on Node.js (server/)
- **Database**: PostgreSQL + Drizzle ORM (shared/schema.ts)
- **Styling**: Custom design tokens with Armanino brand colors (amber/orange #DA720F)

## Project Structure
```
client/src/          - React frontend
  components/layout/ - AppLayout, Sidebar
  pages/             - Dashboard, DealsList, DealDetail, NewDeal, RateCards, ScopeCatalogAdmin
  hooks/use-api.ts   - All API hooks (React Query)
  lib/utils.ts       - Utility functions
  index.css          - Tailwind + design tokens
server/              - Express backend
  index.ts           - Server entry, schema push, seeding
  routes.ts          - All API routes (CRUD + AI endpoints)
  db.ts              - Database connection
  seed.ts            - Sample data seeding
shared/              - Shared code
  schema.ts          - Drizzle ORM schema (all tables + relations)
```

## Key Routes
- `/` - Dashboard with KPIs, recent deals, activity feed
- `/deals` - Deal list with search, filter, table/card view
- `/deals/new` - Create new deal form
- `/deals/:id` - Deal detail with 8-step wizard (Setup, Scope, Assumptions, Pricing, Scenarios, Review, Approval, Summary)
- `/admin/rate-cards` - Rate card management
- `/admin/scope-catalog` - Scope catalog browser

## API Endpoints
- `GET /api/dashboard/summary` - KPI summary
- `GET/POST /api/deals` - Deal CRUD
- `GET/PATCH /api/deals/:id` - Deal detail/update
- `GET /api/scope-catalog` - Scope catalog items
- `GET/POST/DELETE /api/deals/:dealId/scope-items` - Deal scope items
- `GET /api/roles` - Available roles
- `GET /api/rate-cards` - Rate cards
- `GET/PATCH /api/deals/:dealId/pricing` - Pricing grid
- `GET /api/deals/:dealId/scenarios` - Pricing scenarios
- `GET/POST /api/deals/:dealId/approvals` - Approval workflow
- `POST /api/ai/deal-similarity` - AI deal matching
- `POST /api/ai/effort-estimation` - AI effort estimation
- `POST /api/ai/margin-advisor` - AI margin optimization
- `POST /api/ai/scenario-recommendation` - AI scenario recommendation
- `POST /api/ai/risk-summary` - AI risk assessment

## Database Tables
clients, deals, scope_catalog, deal_scope_items, roles, rate_cards, rate_card_entries, pricing_lines, scenarios, approvals, prompt_responses, activity_log

## Workflows
- Backend Server: `npx tsx server/index.ts` (port 3001)
- DealPad Frontend: `npx vite --host 0.0.0.0 --port 5000` (port 5000, proxies /api to 3001)

## Design References
- UX: Ramp.com (minimal, high-contrast) + Gusto.com (warm, sidebar nav, card hierarchy)
- Brand: Armanino LLP (amber #DA720F, olive #949300, Roboto + Playfair Display)
- No emojis in UI

## Key Documents
- `attached_assets/requirements-executice-summary_*.txt` - Requirements executive summary
- `attached_assets/scope_*.txt` - Scope of solution
- `attached_assets/Dealpad-technical-outline_*.pdf` - Technical outline
- `attached_assets/3._User_Stories_*.pdf` - 69 user stories across 8 epics
