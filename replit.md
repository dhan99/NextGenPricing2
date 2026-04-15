# DealPad - NextGenApp Pricing & Scoping 2.0

## Overview
DealPad is a web-based application replacing Excel-based pricing and scoping workbooks for the Quote-to-Cash workflow. It digitizes pricing methodologies while preserving calculation fidelity, using a Domain-Driven Design architecture with AI-infused capabilities targeting Azure cloud.

## Current State
- **Phase**: Architecture & Design Review (pre-build)
- **Active Page**: Interactive architecture diagram showing system layers, DDD principles, AI use cases, and data flow

## Architecture
- **Frontend**: React 19 + Vite + TypeScript (target: Shadcn/ui + Tailwind + TanStack)
- **Backend**: Node.js + Fastify on Azure Functions
- **Domain Services**: Azure Container Apps (6 bounded contexts)
- **AI Layer**: Azure OpenAI + Semantic Kernel + LangGraph
- **Database**: PostgreSQL + Redis + Azure AI Search
- **Infrastructure**: Azure cloud-native (APIM, Service Bus, Event Grid)

## Key Documents
- `attached_assets/requirements-executice-summary_*.txt` - Requirements executive summary
- `attached_assets/scope_*.txt` - Scope of solution
- `attached_assets/Dealpad-technical-outline_*.pdf` - Technical outline
- `attached_assets/3._User_Stories_*.pdf` - 69 user stories across 8 epics
- `attached_assets/Screenshot_*` - Figma UX design screenshots (~35 screens)

## Domain Bounded Contexts (DDD)
1. **Deal Context** - Deal lifecycle, versioning, project classification (US-01 to US-07)
2. **Scope Context** - Scope items, assemblies, prompts, validation (US-08 to US-17)
3. **Pricing Context** - Pricing grid, rates, margin, pricing models (US-18 to US-31)
4. **Approval Context** - Tiered routing, delegation, fast-track (US-39 to US-45)
5. **Catalog & Config Context** - Rate tables, templates, admin governance (US-54 to US-57)
6. **Analytics Context** - Dashboards, benchmarks, reporting (US-32 to US-38, US-52 to US-53)

## Personas
- Project Delivery Lead (PDL) - primary user
- Practice Area / Service Line Leadership - approvers
- Pricing Operations - governance & configuration
- Finance / FP&A - margin validation
- Risk / QRM - audit oversight
- IT / Data Consumers - integrations

## External Integrations
- Microsoft Dynamics CRM (bi-directional)
- Workday (budget/resource planning)
- Intapp (conflict & independence)
- Power BI (dashboards & reporting)
