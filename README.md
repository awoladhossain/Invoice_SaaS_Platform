# 🚀 Multi-Tenant Invoice SaaS Platform

An enterprise-grade, high-concurrency, scalable, and secure **Multi-Tenant Invoice SaaS Platform** built with **NestJS**, **PostgreSQL (Prisma ORM)**, **BullMQ**, **Redis**, **Docker**, and **Clean Architecture**.

---

## 📌 Table of Contents
- [✨ Key Features](#-key-features)
- [🛠 Tech Stack](#-tech-stack)
- [🏗 Architecture & Layering](#-architecture--layering)
- [🗄 Database Schema & Multi-Tenancy](#-database-schema--multi-tenancy)
- [⚡ Core Business Logic & Use Cases](#-core-business-logic--use-cases)
- [🔄 Background Job Processing (BullMQ)](#-background-job-processing-bullmq)
- [🛡 Security, Compliance & Observability](#-security-compliance--observability)
- [🐳 Docker & DevOps Setup](#-docker--devops-setup)
- [🚦 Getting Started](#-getting-started)

---

## ✨ Key Features

- 🏢 **Advanced Multi-Tenancy:** Complete tenant isolation using tenant-aware Prisma extensions and automatic `tenantId` injection.
- 🎨 **Tenant Customization:** Per-tenant branding including custom logos, color schemes, and invoice templates.
- 🔔 **Intelligent Dunning System:** Automated payment reminders using **BullMQ** with exponential backoff retries and Dead Letter Queue (DLQ) handling.
- ⚡ **Real-Time Updates:** WebSocket (`Socket.io`) integration for instant payment notifications and dashboard synchronization.
- 💳 **Subscription & Billing:** Usage-based billing, automatic proration calculations on plan upgrades/downgrades, and Stripe payment gateway integration.
- 🔒 **Security & RBAC:** Role-Based Access Control (`SuperAdmin`, `TenantAdmin`, `Accountant`, `Viewer`), Audit Logging, and Redis-based rate limiting.
- 📊 **DevOps & Observability:** Health checks for DB, Redis, and queues, structured Pino logging with Correlation IDs, and Docker Compose orchestration.

---

## 🛠 Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | 🟩 NestJS (Node.js & TypeScript) | Enterprise backend framework |
| **Database** | 🐘 PostgreSQL | Primary relational database |
| **ORM** | ◮ Prisma ORM | Type-safe database queries & migrations |
| **Queue / Jobs** | 🐂 BullMQ | High-performance distributed queues |
| **In-Memory Store** | 🔴 Redis | Caching, session management & rate limiting |
| **Real-Time** | ⚡ Socket.io | WebSockets for real-time notifications |
| **Containerization** | 🐳 Docker & Docker Compose | Multi-stage production container build |
| **Testing** | 🃏 Jest | Unit & Integration testing suite |
| **Documentation** | 📘 Swagger / OpenAPI | Auto-generated REST API documentation |

---

## 🏗 Architecture & Layering

The system strictly adheres to **Clean Architecture** (Ports & Adapters / Hexagonal Architecture) to ensure loose coupling, high testability, and framework independence.

### 📂 Directory Structure

```text
src/
├── 🎯 domain/                    # Layer 1: Core Enterprise Domain Rules & Entities
│   ├── entities/              # Pure domain models (Tenant, Invoice, Payment, User)
│   ├── events/                # Domain Events (InvoiceCreatedEvent, PaymentProcessedEvent)
│   ├── exceptions/            # Custom domain errors (InvoiceAlreadyPaidException)
│   ├── repositories/          # Repository Ports (IInvoiceRepository, ITenantRepository)
│   └── value-objects/         # Value Objects (Money, Email, InvoiceStatus)
│
├── ⚙️ application/               # Layer 2: Application Use Cases & Orchestration
│   ├── dtos/                  # Application DTOs (Request / Response)
│   ├── interfaces/            # Service Ports (IEmailService, IPaymentGateway)
│   ├── use-cases/             # Isolated Use Cases
│   │   ├── invoice/           # CreateInvoiceUseCase, CancelInvoiceUseCase
│   │   ├── payment/           # ProcessPaymentUseCase, HandleStripeWebhookUseCase
│   │   └── tenant/            # CreateTenantUseCase, UpdateTenantSettingsUseCase
│   └── event-handlers/        # Domain event listeners & integration event triggers
│
├── 🔌 infrastructure/            # Layer 3: Technical Implementations & Framework Adapters
│   ├── database/              # Prisma Client & Repositories
│   │   ├── prisma/            # Prisma extensions & tenant context middleware
│   │   └── repositories/      # PrismaInvoiceRepository, PrismaTenantRepository
│   ├── queues/                # BullMQ Producers & Processors
│   │   ├── email/             # EmailQueueProducer, EmailQueueProcessor
│   │   └── reminder/          # ReminderQueueProducer, ReminderQueueProcessor
│   ├── services/              # External Adapters (StripeGateway, SmtpMailService)
│   └── security/              # JwtStrategy, RolesGuard, AuditLoggerService
│
└── 🌐 interface/                 # Layer 4: Primary Adapters / Delivery Mechanism
    ├── http/
    │   ├── controllers/       # InvoiceController, PaymentController, HealthController
    │   ├── middlewares/       # TenantContextMiddleware, CorrelationIdMiddleware
    │   └── guards/            # JwtAuthGuard, RolesGuard, ThrottlerGuard
    ├── websockets/            # NotificationGateway (Socket.io)
    └── dtos/                  # Request validation schemas (class-validator)
```

---

## 🗄 Database Schema & Multi-Tenancy

### 🔑 Multi-Tenancy Strategy
1. **Discriminator Column (`tenantId`):** All tenant-specific tables contain a mandatory `tenantId` foreign key referencing the `Tenant` table.
2. **Automated Tenant Isolation:** A Prisma extended client reads the `tenantId` from the AsyncLocalStorage execution context and automatically appends `where: { tenantId }` to all query calls.
3. **Compound Indexes:** Optimized indexing on `[tenantId, status]`, `[tenantId, dueDate]`, and `[tenantId, createdAt]` to maximize query efficiency.

---

## ⚡ Core Business Logic & Use Cases

### 1️⃣ Invoice Creation Flow (`CreateInvoiceUseCase`)

```text
[ Client HTTP Request ]
          │
          ▼
┌──────────────────────────────────┐
│ InvoiceController (Interface)    │ ── (Validate DTO & Extract Tenant Context)
└──────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────┐
│ CreateInvoiceUseCase             │ ── (Check Subscription Limits via ISubscriptionPort)
└──────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────┐
│ Invoice Domain Entity            │ ── (Validate Domain Rules: amount > 0, valid dueDate)
└──────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────┐
│ IInvoiceRepository (Port)        │ ── (Persist to PostgreSQL via Prisma Adapter)
└──────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────┐
│ Domain Event Dispatcher          │ ── (Publish InvoiceCreatedEvent)
└──────────────────────────────────┘
          │
      ┌───┴──────────────────────────────┐
      ▼                                  ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ EmailQueueProducer       │    │ ReminderQueueProducer    │
│ (Send PDF Email)         │    │ (Schedule Dunning Jobs)  │
└──────────────────────────┘    └──────────────────────────┘
```

---

## 🔄 Background Job Processing (BullMQ)

### 🔔 Dunning System Schedules
- 📅 **-1 Day Before Due Date:** Friendly payment reminder email.
- 📅 **On Due Date:** Invoice due notification with payment link.
- 📅 **+3 Days Overdue:** Urgent reminder notification.
- 📅 **+7 Days Overdue:** Account suspension warning & final reminder.

### 🛡 Retry & Failure Management
- **Exponential Backoff:** Configured with 5 retry attempts, doubling delay after each failed attempt.
- **Dead Letter Queue (DLQ):** Failed jobs beyond max retries are moved to `reminder-dlq` for manual inspection via BullMQ Dashboard.

---

## 🐳 Docker & DevOps Setup

### 📦 Services Orchestration (`docker-compose.yml`)
- 🐘 **PostgreSQL (v16):** Database container with health checks.
- 🔴 **Redis (v7):** Queue broker & caching engine with append-only persistence.
- ⚡ **NestJS Application:** Multi-stage built Node.js app container.
- 📊 **Bull-Board Dashboard:** Web interface monitoring queue metrics on port `3001`.

---

## 🚦 Getting Started

### 1️⃣ Clone & Install
```bash
git clone https://github.com/your-org/invoice-saas.git
cd invoice-saas
npm install
```

### 2️⃣ Configure Environment
```bash
cp .env.example .env
```

### 3️⃣ Start Infrastructure via Docker
```bash
docker compose up -d
```

### 4️⃣ Run Prisma Migrations
```bash
npx prisma migrate dev
```

### 5️⃣ Run Application
```bash
# Development Mode
npm run start:dev

# Production Mode
npm run build && npm run start:prod
```

### 6️⃣ Run Tests & Lint
```bash
# Unit & Integration Tests
npm run test

# Code Formatting & Linting
npm run lint
```
