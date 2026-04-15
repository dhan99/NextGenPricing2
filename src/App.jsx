import React, { useState } from 'react';

const layers = [
  {
    id: 'presentation',
    name: 'Presentation Layer',
    subtitle: 'Azure Static Web Apps + CDN',
    color: '#3B82F6',
    lightColor: '#EFF6FF',
    items: [
      {
        name: 'React SPA',
        desc: 'Vite + TypeScript + TanStack Router',
        details: 'High-performance single-page application with code splitting, lazy loading, and optimistic UI updates. TanStack Query for server state management with automatic caching and background refetching.',
        tech: ['React 19', 'TypeScript', 'Vite', 'TanStack Query', 'TanStack Router'],
      },
      {
        name: 'Design System',
        desc: 'Shadcn/ui + Tailwind CSS + Radix',
        details: 'Accessible, composable component library built on Radix primitives. Tailwind CSS for utility-first styling. Consistent design tokens across all views.',
        tech: ['Shadcn/ui', 'Tailwind CSS', 'Radix UI', 'Framer Motion'],
      },
      {
        name: 'AI Chat Interface',
        desc: 'Conversational AI Assistant Panel',
        details: 'Embedded AI assistant for deal analysis, pricing recommendations, and natural language queries. Streaming responses via Server-Sent Events.',
        tech: ['Vercel AI SDK', 'SSE Streaming', 'Markdown Renderer'],
      },
      {
        name: 'Pricing Grid Engine',
        desc: 'Virtualized spreadsheet-like grid',
        details: 'High-performance editable grid for hours × roles matrix. Supports 1000+ cells with virtual scrolling, real-time formula recalculation, and undo/redo.',
        tech: ['AG Grid / TanStack Table', 'Web Workers', 'IndexedDB'],
      },
    ],
  },
  {
    id: 'gateway',
    name: 'API Gateway & Orchestration',
    subtitle: 'Azure API Management + Azure Functions',
    color: '#8B5CF6',
    lightColor: '#F5F3FF',
    items: [
      {
        name: 'API Gateway',
        desc: 'Azure API Management (APIM)',
        details: 'Centralized API gateway handling authentication, rate limiting, request routing, API versioning, and observability. JWT validation with Azure AD B2C.',
        tech: ['Azure APIM', 'OAuth 2.0 / OIDC', 'Azure AD B2C', 'Rate Limiting'],
      },
      {
        name: 'BFF (Backend for Frontend)',
        desc: 'Node.js / Fastify on Azure Functions',
        details: 'Lightweight Backend-for-Frontend layer that aggregates domain service calls, shapes responses for the UI, and handles session management. Deployed as Azure Functions for serverless scaling.',
        tech: ['Node.js', 'Fastify', 'Azure Functions', 'TypeScript'],
      },
      {
        name: 'AI Orchestration Agent',
        desc: 'Semantic Kernel / LangGraph Agent',
        details: 'Agentic orchestration layer that coordinates AI capabilities across the platform. Manages tool calling, retrieval-augmented generation, and multi-step reasoning for pricing intelligence.',
        tech: ['Azure OpenAI', 'Semantic Kernel', 'LangGraph', 'Function Calling'],
      },
      {
        name: 'Event Bus',
        desc: 'Azure Service Bus / Event Grid',
        details: 'Asynchronous event-driven communication between bounded contexts. Domain events (DealCreated, PricingApproved, ScopeChanged) propagate state changes across services.',
        tech: ['Azure Service Bus', 'Azure Event Grid', 'CloudEvents'],
      },
    ],
  },
  {
    id: 'domain',
    name: 'Domain Services Layer (DDD Bounded Contexts)',
    subtitle: 'Azure Container Apps (Microservices)',
    color: '#059669',
    lightColor: '#ECFDF5',
    items: [
      {
        name: 'Deal Context',
        desc: 'Deal lifecycle & project management',
        details: 'Core aggregate managing deal creation, versioning, and state transitions (Draft → Submitted → In Review → Approved). Handles new project and renewal project workflows, entity management, and project arrangement selection.',
        tech: ['Deal Aggregate', 'Version Entity', 'Project Classification', 'State Machine'],
        stories: 'US-01 to US-07',
      },
      {
        name: 'Scope Context',
        desc: 'Scope items, assemblies & prompts',
        details: 'Manages the governed scope item catalog, assembly expansion with recursive calculation, prompt-driven multipliers, and scope validation. Enforces guardrails on manual adjustments.',
        tech: ['Scope Item Catalog', 'Assembly Engine', 'Prompt Processor', 'Validation Rules'],
        stories: 'US-08 to US-17',
      },
      {
        name: 'Pricing Context',
        desc: 'Pricing grid, rates & margin calculation',
        details: 'Calculation engine that produces defensible project economics. Applies rate tables (standard/contract), geo/offshore discounts, and supports Fixed Fee, T&M, and Hybrid pricing models. Ensures workbook parity.',
        tech: ['Pricing Engine', 'Rate Table Service', 'Margin Calculator', 'Scenario Modeler'],
        stories: 'US-18 to US-31, US-58 to US-69',
      },
      {
        name: 'Approval Context',
        desc: 'Tiered approval routing & governance',
        details: 'Workflow engine for risk-appropriate approval routing. Supports tiered chains (Manager → Director → Partner), fast-track paths, delegation, and configurable thresholds by BU.',
        tech: ['Approval Workflow', 'Routing Rules', 'Delegation', 'Audit Trail'],
        stories: 'US-39 to US-45, US-65 to US-66',
      },
      {
        name: 'Catalog & Config Context',
        desc: 'Rate tables, templates & admin governance',
        details: 'Administrative bounded context for managing governed catalogs, rate cards, pricing templates, and Business Unit configurations. All changes are versioned and auditable.',
        tech: ['Rate Card Mgmt', 'Template Engine', 'BU Configuration', 'Version Control'],
        stories: 'US-54 to US-57',
      },
      {
        name: 'Analytics Context',
        desc: 'Dashboards, benchmarks & reporting',
        details: 'Read-model services for operational dashboards, benchmark comparisons, actual vs. planned margin reporting, and renewal YoY summaries.',
        tech: ['CQRS Read Models', 'Materialized Views', 'Time-Series Analytics'],
        stories: 'US-32 to US-38, US-52 to US-53',
      },
    ],
  },
  {
    id: 'ai',
    name: 'AI & Intelligence Layer',
    subtitle: 'Azure OpenAI + Azure AI Services',
    color: '#D97706',
    lightColor: '#FFFBEB',
    items: [
      {
        name: 'Pricing Intelligence Agent',
        desc: 'AI-driven pricing recommendations',
        details: 'Analyzes historical deal data, win/loss patterns, and market benchmarks to suggest optimal pricing strategies. Provides margin optimization recommendations and risk-adjusted pricing guidance.',
        tech: ['Azure OpenAI GPT-4o', 'RAG Pipeline', 'Vector Search'],
      },
      {
        name: 'Scope Estimation Agent',
        desc: 'AI-assisted effort estimation',
        details: 'Uses historical project data and complexity signals to predict effort, suggest scope item combinations, and flag estimation outliers. Learns from actual vs. estimated variance over time.',
        tech: ['Few-Shot Learning', 'Embedding Models', 'Anomaly Detection'],
      },
      {
        name: 'Deal Insights Agent',
        desc: 'Natural language deal analysis',
        details: 'Powers the conversational AI assistant. Answers questions about deal portfolio, surfaces insights ("show deals below 20% margin"), and generates executive summaries.',
        tech: ['Function Calling', 'Tool Use', 'Structured Output'],
      },
      {
        name: 'Document Intelligence',
        desc: 'Excel workbook & document parsing',
        details: 'Extracts pricing structures from existing Excel workbooks, parses engagement letters, and ingests historical pricing data for migration and benchmark building.',
        tech: ['Azure AI Document Intelligence', 'Excel Parser', 'Data Extraction'],
      },
    ],
  },
  {
    id: 'data',
    name: 'Data & Persistence Layer',
    subtitle: 'Azure Database Services',
    color: '#DC2626',
    lightColor: '#FEF2F2',
    items: [
      {
        name: 'Operational Database',
        desc: 'Azure SQL / PostgreSQL Flexible Server',
        details: 'Primary transactional store for all domain aggregates. Supports JSONB for flexible schema evolution, row-level security for multi-tenant data isolation, and full audit logging.',
        tech: ['PostgreSQL 16', 'Drizzle ORM', 'Row-Level Security', 'JSONB'],
      },
      {
        name: 'Vector Store',
        desc: 'Azure AI Search / pgvector',
        details: 'Stores embeddings for historical deals, scope items, and pricing patterns. Enables semantic search for benchmark finding and similar-deal discovery.',
        tech: ['Azure AI Search', 'pgvector', 'HNSW Indexing'],
      },
      {
        name: 'Cache Layer',
        desc: 'Azure Cache for Redis',
        details: 'Caches rate tables, catalog data, session state, and computation results. Supports pub/sub for real-time UI updates during collaborative pricing sessions.',
        tech: ['Redis 7', 'Cache-Aside Pattern', 'Pub/Sub'],
      },
      {
        name: 'Data Lake / Warehouse',
        desc: 'Azure Synapse / Data Lake Storage',
        details: 'Long-term storage for historical pricing data, actual margin reporting, and analytics workloads. Powers Power BI dashboards and feeds Workday/CRM integrations.',
        tech: ['Azure Data Lake Gen2', 'Synapse Analytics', 'Delta Lake'],
      },
    ],
  },
  {
    id: 'integration',
    name: 'Integration & External Systems',
    subtitle: 'Azure Integration Services',
    color: '#6366F1',
    lightColor: '#EEF2FF',
    items: [
      {
        name: 'Microsoft Dynamics CRM',
        desc: 'Bi-directional customer & opportunity sync',
        details: 'Syncs customer/account data, opportunity context, and project identifiers. Enables "Import from CRM" flow and writes back approved pricing outputs.',
        tech: ['Dynamics 365 API', 'Dataverse', 'Webhook Listeners'],
      },
      {
        name: 'Workday',
        desc: 'ERP integration for budgets & resources',
        details: 'Exports approved hours by role/skill for project setup, expected margin for budgeting, and resource planning data. Supports Workday Adaptive for forecasting.',
        tech: ['Workday REST API', 'Workday Adaptive', 'iLoad Templates'],
      },
      {
        name: 'Intapp',
        desc: 'Conflict & independence, intake/onboarding',
        details: 'Integrates with Intapp for conflict checks, independence validation, and intake/onboarding workflows triggered by approved deals.',
        tech: ['Intapp API', 'Webhook Events', 'Status Sync'],
      },
      {
        name: 'Power BI',
        desc: 'Executive dashboards & renewal tracking',
        details: 'Provides data feeds for executive dashboards, renewal management reporting, and actual-vs-planned margin analysis.',
        tech: ['Power BI Embedded', 'DirectQuery', 'Data Feeds'],
      },
    ],
  },
];

const crossCuttingConcerns = [
  { name: 'Observability', desc: 'Azure Monitor + Application Insights + OpenTelemetry', icon: '📊' },
  { name: 'Security', desc: 'Azure AD B2C + RBAC + Encryption at Rest/Transit', icon: '🔒' },
  { name: 'DevOps', desc: 'GitHub Actions + Azure Container Registry + IaC (Bicep)', icon: '🚀' },
  { name: 'Audit & Compliance', desc: 'Immutable audit log + Data retention policies + SOC 2', icon: '📋' },
];

const dddPrinciples = [
  { title: 'Bounded Contexts', desc: 'Each domain service owns its data and logic, communicating via well-defined contracts and domain events.' },
  { title: 'Aggregates & Entities', desc: 'Deal, Scope, Pricing, and Approval are aggregate roots with consistent transactional boundaries.' },
  { title: 'Domain Events', desc: 'DealCreated, ScopeFinalized, PricingCalculated, ApprovalRequested drive cross-context workflows asynchronously.' },
  { title: 'CQRS Pattern', desc: 'Command (write) and Query (read) models are separated. Analytics uses materialized read models for performance.' },
  { title: 'Anti-Corruption Layers', desc: 'Integration with CRM, Workday, and Intapp uses ACL adapters to protect domain model integrity.' },
  { title: 'Ubiquitous Language', desc: 'Scope Item, Assembly, Prompt, Rate Card, Price Item — domain terms used consistently in code and UI.' },
];

const aiUseCases = [
  { title: 'Smart Pricing Recommendations', desc: 'AI suggests optimal fee structures based on historical win rates, client segments, and margin targets.', phase: 'Phase 1' },
  { title: 'Effort Estimation Copilot', desc: 'Predicts hours by role based on scope complexity, client history, and similar past projects.', phase: 'Phase 1' },
  { title: 'Natural Language Deal Queries', desc: '"Show me all Technology Consulting deals below 20% margin in Q2" — conversational analytics.', phase: 'Phase 1' },
  { title: 'Anomaly Detection', desc: 'Flags unusual pricing patterns, outlier margins, or scope-to-effort mismatches before approval.', phase: 'Phase 2' },
  { title: 'Auto-Fill from Documents', desc: 'Extracts scope, entities, and pricing from uploaded RFPs, SOWs, or existing Excel workbooks.', phase: 'Phase 2' },
  { title: 'Approval Routing Intelligence', desc: 'AI recommends fast-track vs. full review based on deal risk profile and historical approval patterns.', phase: 'Phase 2' },
  { title: 'Competitive Pricing Insights', desc: 'Benchmarks pricing against market data and similar engagements across Business Units.', phase: 'Phase 3' },
  { title: 'Renewal Prediction', desc: 'Predicts renewal likelihood and suggests proactive pricing adjustments for at-risk clients.', phase: 'Phase 3' },
];

function LayerCard({ layer, isExpanded, onToggle }) {
  return (
    <div style={{
      border: `2px solid ${layer.color}20`,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'all 0.2s ease',
    }}>
      <div
        onClick={onToggle}
        style={{
          background: layer.lightColor,
          padding: '20px 24px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: isExpanded ? `1px solid ${layer.color}20` : 'none',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: layer.color,
            }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>
              {layer.name}
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 20px', fontSize: 14, color: '#666' }}>
            {layer.subtitle}
          </p>
        </div>
        <div style={{
          fontSize: 14,
          color: layer.color,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {layer.items.length} services
          <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
        </div>
      </div>
      {isExpanded && (
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {layer.items.map((item, i) => (
            <div key={i} style={{
              border: '1px solid #E5E7EB',
              borderRadius: 12,
              padding: 16,
              background: '#FAFAFA',
              transition: 'box-shadow 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111' }}>{item.name}</h3>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: layer.color, fontWeight: 600 }}>{item.desc}</p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>{item.details}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {item.tech.map((t, j) => (
                  <span key={j} style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: `${layer.color}10`,
                    color: layer.color,
                    fontWeight: 600,
                    border: `1px solid ${layer.color}20`,
                  }}>{t}</span>
                ))}
              </div>
              {item.stories && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
                  User Stories: {item.stories}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [expandedLayers, setExpandedLayers] = useState(new Set(['domain', 'ai']));
  const [activeTab, setActiveTab] = useState('architecture');

  const toggleLayer = (id) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedLayers(new Set(layers.map(l => l.id)));
  const collapseAll = () => setExpandedLayers(new Set());

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#F9FAFB', minHeight: '100vh' }}>
      <header style={{
        background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
        color: '#fff',
        padding: '40px 24px 32px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800,
            }}>D</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', letterSpacing: 2, textTransform: 'uppercase' }}>DealPad</span>
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 32, fontWeight: 800 }}>High-Level System Architecture</h1>
          <p style={{ margin: 0, fontSize: 16, color: '#94A3B8', maxWidth: 700 }}>
            NextGenApp Pricing & Scoping 2.0 — Domain-Driven, AI-Infused, Azure-Native
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <nav style={{
          display: 'flex',
          gap: 0,
          borderBottom: '2px solid #E5E7EB',
          marginBottom: 24,
          background: '#fff',
          borderRadius: '12px 12px 0 0',
          marginTop: -16,
          padding: '0 8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {[
            { id: 'architecture', label: 'Architecture Layers' },
            { id: 'ddd', label: 'DDD Principles' },
            { id: 'ai', label: 'AI Use Cases' },
            { id: 'flow', label: 'Data Flow' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '14px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                color: activeTab === tab.id ? '#3B82F6' : '#6B7280',
                borderBottom: activeTab === tab.id ? '2px solid #3B82F6' : '2px solid transparent',
                marginBottom: -2,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'architecture' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>
                Click each layer to expand and explore the services within. The architecture follows a layered DDD approach with clear bounded contexts.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={expandAll} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Expand All</button>
                <button onClick={collapseAll} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Collapse All</button>
              </div>
            </div>
            {layers.map(layer => (
              <LayerCard
                key={layer.id}
                layer={layer}
                isExpanded={expandedLayers.has(layer.id)}
                onToggle={() => toggleLayer(layer.id)}
              />
            ))}
            <div style={{
              background: '#fff',
              border: '2px dashed #D1D5DB',
              borderRadius: 16,
              padding: 24,
              marginTop: 8,
              marginBottom: 32,
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#374151' }}>Cross-Cutting Concerns</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {crossCuttingConcerns.map((c, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', background: '#F9FAFB', borderRadius: 10,
                    border: '1px solid #E5E7EB',
                  }}>
                    <span style={{ fontSize: 24 }}>{c.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{c.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ddd' && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              background: 'linear-gradient(135deg, #ECFDF5, #F0FDF4)',
              border: '2px solid #05966920',
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#065F46' }}>Domain-Driven Design Approach</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#047857', lineHeight: 1.6 }}>
                The DealPad architecture is built around strategic DDD patterns. The pricing domain is decomposed into six bounded contexts,
                each with clear ownership, its own data store partition, and well-defined integration contracts. This enables independent
                evolution and deployment of each context while maintaining domain integrity.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
              {dddPrinciples.map((p, i) => (
                <div key={i} style={{
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#059669' }}>{p.title}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              ))}
            </div>
            <div style={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 16,
              padding: 24,
              marginTop: 24,
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Context Map</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { from: 'Deal Context', to: 'Scope Context', rel: 'Partnership', event: 'DealInitiated → ScopeCreated' },
                  { from: 'Scope Context', to: 'Pricing Context', rel: 'Customer-Supplier', event: 'ScopeFinalized → PricingCalculated' },
                  { from: 'Pricing Context', to: 'Approval Context', rel: 'Customer-Supplier', event: 'PricingSubmitted → ApprovalRequested' },
                  { from: 'Approval Context', to: 'Deal Context', rel: 'Partnership', event: 'ApprovalCompleted → DealApproved' },
                  { from: 'Catalog Context', to: 'Scope Context', rel: 'Conformist', event: 'CatalogUpdated → ScopeItemsRefreshed' },
                  { from: 'All Contexts', to: 'Analytics Context', rel: 'Published Language', event: 'Domain Events → Read Model Projections' },
                ].map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 16px', background: '#F9FAFB', borderRadius: 8,
                    fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 700, color: '#059669', minWidth: 120 }}>{r.from}</span>
                    <span style={{ color: '#9CA3AF' }}>→</span>
                    <span style={{ fontWeight: 700, color: '#059669', minWidth: 120 }}>{r.to}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4,
                      background: '#EFF6FF', color: '#3B82F6',
                      fontSize: 11, fontWeight: 600,
                    }}>{r.rel}</span>
                    <span style={{ color: '#6B7280', fontSize: 12, marginLeft: 'auto' }}>{r.event}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)',
              border: '2px solid #D9770620',
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#92400E' }}>Agentic AI Architecture</h2>
              <p style={{ margin: 0, fontSize: 14, color: '#A16207', lineHeight: 1.6 }}>
                DealPad is built with an agentic AI model at its core. Rather than bolting AI onto existing workflows, the architecture
                treats AI agents as first-class participants in the pricing process. The AI Orchestration layer uses Azure OpenAI with
                Semantic Kernel for tool calling and multi-step reasoning, enabling agents to assist with pricing, scoping, and analysis
                tasks autonomously while keeping humans in the loop for decisions.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
              {aiUseCases.map((uc, i) => (
                <div key={i} style={{
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  position: 'relative',
                }}>
                  <span style={{
                    position: 'absolute', top: 12, right: 12,
                    padding: '2px 8px', borderRadius: 4,
                    fontSize: 11, fontWeight: 700,
                    background: uc.phase === 'Phase 1' ? '#DCFCE7' : uc.phase === 'Phase 2' ? '#FEF3C7' : '#E0E7FF',
                    color: uc.phase === 'Phase 1' ? '#166534' : uc.phase === 'Phase 2' ? '#92400E' : '#3730A3',
                  }}>{uc.phase}</span>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#D97706', paddingRight: 60 }}>{uc.title}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.6 }}>{uc.desc}</p>
                </div>
              ))}
            </div>
            <div style={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 16,
              padding: 24,
              marginTop: 24,
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Agentic Model Pattern</h3>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap' }}>
                {[
                  { label: 'User Intent', color: '#3B82F6', desc: 'Natural language or UI action' },
                  { label: 'AI Orchestrator', color: '#8B5CF6', desc: 'Semantic Kernel / LangGraph' },
                  { label: 'Tool Selection', color: '#D97706', desc: 'Function calling to domain APIs' },
                  { label: 'Domain Execution', color: '#059669', desc: 'Bounded context operations' },
                  { label: 'Response Synthesis', color: '#DC2626', desc: 'Structured output + explanation' },
                ].map((step, i) => (
                  <React.Fragment key={i}>
                    <div style={{ textAlign: 'center', minWidth: 140, padding: '8px 4px' }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: `${step.color}15`, border: `2px solid ${step.color}`,
                        margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 800, color: step.color,
                      }}>{i + 1}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: step.color }}>{step.label}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{step.desc}</div>
                    </div>
                    {i < 4 && <div style={{ display: 'flex', alignItems: 'center', color: '#D1D5DB', fontSize: 20, padding: '0 4px' }}>→</div>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'flow' && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 16,
              padding: 24,
              marginBottom: 24,
            }}>
              <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>End-to-End Data Flow: New Deal Pricing</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { step: 1, title: 'Deal Initiation', desc: 'PDL clicks "+ New Pricing" or imports from CRM. Project context (client, BU, service type, entities) loaded.', layer: 'Presentation → Deal Context', color: '#3B82F6' },
                  { step: 2, title: 'Scope Configuration', desc: 'PDL selects scope items from governed catalog. Assemblies expand into price item components.', layer: 'Presentation → Scope Context', color: '#3B82F6' },
                  { step: 3, title: 'Prompt-Driven Adjustments', desc: 'PDL answers complexity/risk prompts. Multipliers recalculate assembly quantities in real-time.', layer: 'Scope Context (internal)', color: '#059669' },
                  { step: 4, title: 'AI Effort Estimation', desc: 'Scope Estimation Agent suggests hours by role based on historical data and complexity signals.', layer: 'AI Layer → Scope Context', color: '#D97706' },
                  { step: 5, title: 'Pricing Grid Calculation', desc: 'Rate tables applied to hours × roles. Margin, blended rate, and gross profit calculated. Grid is editable.', layer: 'Pricing Context', color: '#059669' },
                  { step: 6, title: 'Scenario Modeling', desc: 'PDL creates what-if scenarios (Standard / Premium / Value). AI recommends optimal pricing strategy.', layer: 'Pricing Context + AI Layer', color: '#D97706' },
                  { step: 7, title: 'Version & Submit', desc: 'PDL saves version, runs validation checks. System creates immutable version snapshot and routes for approval.', layer: 'Deal Context → Approval Context', color: '#8B5CF6' },
                  { step: 8, title: 'Tiered Approval', desc: 'Manager → Director → Partner chain based on margin/risk thresholds. Comments, delegation, fast-track supported.', layer: 'Approval Context', color: '#8B5CF6' },
                  { step: 9, title: 'Downstream Output', desc: 'Approved pricing exported to Workday (hours/budget), CRM (opportunity update), and Power BI (dashboards).', layer: 'Integration Layer', color: '#6366F1' },
                  { step: 10, title: 'Analytics & Learning', desc: 'Actual vs. planned margin tracked over time. AI models retrained on outcomes for improved future estimates.', layer: 'Analytics Context + AI Layer', color: '#DC2626' },
                ].map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 40 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: s.color, color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 800, flexShrink: 0,
                      }}>{s.step}</div>
                      {i < 9 && <div style={{ flex: 1, width: 2, background: '#E5E7EB', margin: '4px 0' }} />}
                    </div>
                    <div style={{ padding: '4px 0 20px' }}>
                      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#111' }}>{s.title}</h3>
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>{s.desc}</p>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        background: `${s.color}10`, color: s.color, fontWeight: 600,
                        border: `1px solid ${s.color}20`,
                      }}>{s.layer}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 16,
              padding: 24,
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Technology Stack Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {[
                  { area: 'Frontend', stack: 'React 19 + TypeScript + Vite + Tailwind + Shadcn/ui' },
                  { area: 'API Layer', stack: 'Node.js + Fastify + Azure Functions + APIM' },
                  { area: 'Domain Services', stack: 'TypeScript + Azure Container Apps + Service Bus' },
                  { area: 'AI/ML', stack: 'Azure OpenAI + Semantic Kernel + LangGraph + pgvector' },
                  { area: 'Database', stack: 'PostgreSQL 16 + Drizzle ORM + Redis + Azure AI Search' },
                  { area: 'Infrastructure', stack: 'Azure + Bicep IaC + GitHub Actions + Application Insights' },
                  { area: 'Integrations', stack: 'Dynamics CRM + Workday + Intapp + Power BI' },
                  { area: 'Security', stack: 'Azure AD B2C + OAuth 2.0 + RBAC + Encryption' },
                ].map((t, i) => (
                  <div key={i} style={{ padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', marginBottom: 4 }}>{t.area}</div>
                    <div style={{ fontSize: 13, color: '#374151' }}>{t.stack}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer style={{ background: '#1E293B', color: '#94A3B8', padding: '20px 24px', textAlign: 'center', fontSize: 13, marginTop: 40 }}>
        DealPad Architecture — NextGenApp Pricing & Scoping 2.0 — Domain-Driven Design + Agentic AI on Azure
      </footer>
    </div>
  );
}

export default App;
