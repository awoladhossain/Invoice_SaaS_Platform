# 🏛 System Architecture & Implementation Blueprint

This document outlines the architectural blueprint, multi-tenancy model, database schema, use cases, queue processing, and deployment strategies for the **Multi-Tenant Invoice SaaS Platform**.

---

## 📌 Table of Contents

- [📐 Step 1: Architecture & Folder Structure](#-step-1-architecture--folder-structure)
- [🗄 Step 2: Database Schema Design (Prisma)](#-step-2-database-schema-design-prisma)
- [⚡ Step 3: Core Business Logic (Use Cases)](#-step-3-core-business-logic-use-cases)
- [🔄 Step 4: Background Job Processing (BullMQ)](#-step-4-background-job-processing-bullmq)
- [🐳 Step 5: Docker & Deployment](#-step-5-docker--deployment)

---

## 📐 Step 1: Architecture & Folder Structure

The application follows **Clean Architecture** (Ports & Adapters / Hexagonal Architecture). The core business logic is kept completely isolated from frameworks, databases, and third-party libraries.

### 📁 Directory Layout

```text
src/
├── 🎯 domain/                    # Layer 1: Core Domain Entities & Rules
│   ├── entities/              # Tenant, User, Invoice, Payment, Subscription
│   ├── events/                # InvoiceCreatedEvent, PaymentProcessedEvent
│   ├── exceptions/            # InvalidInvoiceAmountException, TenantSuspendedException
│   ├── repositories/          # Repository Ports (IInvoiceRepository, ITenantRepository)
│   └── value-objects/         # Money, Email, Address, InvoiceStatus
│
├── ⚙️ application/               # Layer 2: Application Workflows & Use Cases
│   ├── dtos/                  # Request / Response DTOs
│   ├── interfaces/            # Service Ports (IEmailService, IPaymentGateway)
│   ├── use-cases/             # Isolated Use Case Logic
│   │   ├── invoice/           # CreateInvoiceUseCase, CancelInvoiceUseCase
│   │   ├── payment/           # ProcessPaymentUseCase, HandleStripeWebhookUseCase
│   │   └── tenant/            # CreateTenantUseCase, UpdateTenantSettingsUseCase
│   └── event-handlers/        # Listeners for Domain & Integration Events
│
├── 🔌 infrastructure/            # Layer 3: Framework Implementations & Adapters
│   ├── database/              # Prisma Service, Migrations & Extended Client
│   │   └── repositories/      # PrismaInvoiceRepository, PrismaTenantRepository
│   ├── queues/                # BullMQ Producers & Processors
│   │   ├── email/             # EmailQueueProducer, EmailQueueProcessor
│   │   └── reminder/          # ReminderQueueProducer, ReminderQueueProcessor
│   ├── services/              # External Integrations (StripeGateway, SmtpMailService)
│   └── security/              # JwtStrategy, RolesGuard, AuditLoggerService
│
└── 🌐 interface/                 # Layer 4: Primary Adapters (HTTP & WebSockets)
    ├── http/
    │   ├── controllers/       # InvoiceController, PaymentController, HealthController
    │   ├── middlewares/       # TenantContextMiddleware, CorrelationIdMiddleware
    │   └── guards/            # JwtAuthGuard, RolesGuard, ThrottlerGuard
    ├── websockets/            # NotificationGateway (Socket.io)
    └── dtos/                  # Request Validation Schemas
```

### 💡 Dependency Injection & Loose Coupling (Ports & Adapters)

- **Domain Isolation:** The `domain` layer has ZERO external dependencies (`@nestjs/*`, `prisma`, `axios`).
- **Ports (Interfaces):** Interface abstractions are declared in `domain/repositories/` or `application/interfaces/`.
- **Adapters (Implementations):** Concrete classes in `infrastructure/` implement these interfaces.
- **NestJS Custom Providers:** Interfaces are bound to concrete implementations in NestJS Modules via Symbol or String tokens.

#### 📝 Code Example: Repository Injection Token Binding

```typescript
// domain/repositories/invoice.repository.interface.ts
export interface IInvoiceRepository {
  findById(id: string, tenantId: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<Invoice>;
  updateStatus(id: string, tenantId: string, status: string): Promise<void>;
}

// infrastructure/database/database.module.ts
import { Module } from '@nestjs/common';
import { PrismaInvoiceRepository } from './repositories/prisma-invoice.repository';

export const INVOICE_REPOSITORY = Symbol('IInvoiceRepository');

@Module({
  providers: [
    {
      provide: INVOICE_REPOSITORY,
      useClass: PrismaInvoiceRepository,
    },
  ],
  exports: [INVOICE_REPOSITORY],
})
export class DatabaseModule {}
```

---

## 🗄 Step 2: Database Schema Design (Prisma)

### 🔑 Multi-Tenancy Strategy

- **Discriminator Column:** Every tenant-owned model includes a `tenantId` column.
- **Tenant Context Extension:** Prisma client is extended using `Prisma.defineExtension` to automatically append `where: { tenantId }` based on the request execution context (`AsyncLocalStorage`).
- **Composite Indexes:** Indexes are strategically defined on `(tenantId, status)` and `(tenantId, dueDate)` for high performance under concurrent access.

#### 📝 Complete `schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  SUPER_ADMIN
  TENANT_ADMIN
  ACCOUNTANT
  VIEWER
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  OVERDUE
  CANCELLED
}

enum PaymentStatus {
  PENDING
  SUCCESSFUL
  FAILED
  REFUNDED
}

enum SubscriptionPlan {
  FREE
  STARTER
  PRO
  ENTERPRISE
}

model Tenant {
  id            String         @id @default(uuid())
  name          String
  slug          String         @unique
  logoUrl       String?
  primaryColor  String?        @default("#3B82F6")
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  users         User[]
  invoices      Invoice[]
  payments      Payment[]
  subscriptions Subscription[]
  auditLogs     AuditLog[]

  @@map("tenants")
}

model User {
  id        String   @id @default(uuid())
  tenantId  String
  email     String   @unique
  password  String
  fullName  String
  role      Role     @default(VIEWER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@map("users")
}

model Subscription {
  id                   String           @id @default(uuid())
  tenantId             String
  plan                 SubscriptionPlan @default(FREE)
  stripeSubscriptionId String?          @unique
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  isActive             Boolean          @default(true)
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  tenant               Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, isActive])
  @@map("subscriptions")
}

model Invoice {
  id            String        @id @default(uuid())
  tenantId      String
  clientName    String
  clientEmail   String
  amount        Decimal       @db.Decimal(12, 2)
  currency      String        @default("USD")
  status        InvoiceStatus @default(DRAFT)
  dueDate       DateTime
  pdfUrl        String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  tenant        Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  payments      Payment[]

  @@index([tenantId, status])
  @@index([tenantId, dueDate])
  @@map("invoices")
}

model Payment {
  id              String        @id @default(uuid())
  tenantId        String
  invoiceId       String
  amount          Decimal       @db.Decimal(12, 2)
  currency        String        @default("USD")
  status          PaymentStatus @default(PENDING)
  stripePaymentId String?       @unique
  createdAt       DateTime      @default(now())

  tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invoice         Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([tenantId, status])
  @@map("payments")
}

model AuditLog {
  id        String   @id @default(uuid())
  tenantId  String
  userId    String
  action    String
  entity    String
  entityId  String
  details   Json?
  ipAddress String?
  createdAt DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, createdAt])
  @@map("audit_logs")
}
```

---

## ⚡ Step 3: Core Business Logic (Use Cases)

### 1️⃣ `CreateInvoiceUseCase` Example

```typescript
// application/use-cases/invoice/create-invoice.use-case.ts
import { Injectable, Inject } from '@nestjs/common';
import { IInvoiceRepository } from '../../../domain/repositories/invoice.repository.interface';
import { InvoiceCreatedEvent } from '../../../domain/events/invoice-created.event';
import { EventDispatcherPort } from '../../interfaces/event-dispatcher.port';
import { CreateInvoiceDto } from '../dtos/create-invoice.dto';

@Injectable()
export class CreateInvoiceUseCase {
  constructor(
    @Inject('IInvoiceRepository')
    private readonly invoiceRepository: IInvoiceRepository,
    @Inject('EventDispatcherPort')
    private readonly eventDispatcher: EventDispatcherPort,
  ) {}

  async execute(tenantId: string, dto: CreateInvoiceDto) {
    // 1. Business Logic Validation
    if (new Date(dto.dueDate) <= new Date()) {
      throw new Error('Due date must be in the future.');
    }

    // 2. Persist Entity via Repository Port
    const invoice = await this.invoiceRepository.save({
      tenantId,
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      amount: dto.amount,
      currency: dto.currency || 'USD',
      dueDate: new Date(dto.dueDate),
      status: 'SENT',
    });

    // 3. Dispatch Domain Event for Asynchronous Queue Processing
    await this.eventDispatcher.dispatch(
      new InvoiceCreatedEvent(invoice.id, tenantId, dto.clientEmail, dto.amount),
    );

    return invoice;
  }
}
```

### 2️⃣ `ProcessPaymentUseCase` Example

```typescript
// application/use-cases/payment/process-payment.use-case.ts
import { Injectable, Inject } from '@nestjs/common';
import { IPaymentGateway } from '../../interfaces/payment-gateway.interface';
import { IInvoiceRepository } from '../../../domain/repositories/invoice.repository.interface';

@Injectable()
export class ProcessPaymentUseCase {
  constructor(
    @Inject('IPaymentGateway') private readonly paymentGateway: IPaymentGateway,
    @Inject('IInvoiceRepository') private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  async execute(tenantId: string, invoiceId: string, paymentMethodId: string) {
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status === 'PAID') throw new Error('Invoice is already paid');

    // Charge via External Stripe Gateway Adapter
    const result = await this.paymentGateway.charge({
      amount: invoice.amount,
      currency: invoice.currency,
      paymentMethodId,
    });

    if (result.success) {
      await this.invoiceRepo.updateStatus(invoiceId, tenantId, 'PAID');
    }

    return result;
  }
}
```

---

## 🔄 Step 4: Background Job Processing (BullMQ)

### 📧 Email Queue & Smart Dunning Setup

```typescript
// infrastructure/queues/reminder/reminder.queue.ts
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class ReminderQueueProducer {
  constructor(@InjectQueue('reminder-queue') private readonly reminderQueue: Queue) {}

  async scheduleDunningReminders(invoiceId: string, tenantId: string, dueDate: Date) {
    const now = Date.now();
    const dueTime = new Date(dueDate).getTime();

    // 1. Reminder 1 Day Before Due Date
    const oneDayBefore = dueTime - 24 * 60 * 60 * 1000 - now;
    if (oneDayBefore > 0) {
      await this.reminderQueue.add(
        'send-reminder',
        { invoiceId, tenantId, stage: 'BEFORE_DUE' },
        { delay: oneDayBefore, attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
      );
    }

    // 2. Overdue 3 Days After
    const threeDaysAfter = dueTime + 3 * 24 * 60 * 60 * 1000 - now;
    if (threeDaysAfter > 0) {
      await this.reminderQueue.add(
        'send-reminder',
        { invoiceId, tenantId, stage: 'OVERDUE_3_DAYS' },
        { delay: threeDaysAfter, attempts: 5, backoff: { type: 'exponential', delay: 10000 } },
      );
    }
  }
}
```

### ⚙️ Worker & Dead Letter Queue (DLQ) Processor

```typescript
// infrastructure/queues/reminder/reminder.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';

@Processor('reminder-queue')
@Injectable()
export class ReminderQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderQueueProcessor.name);

  async process(job: Job<{ invoiceId: string; tenantId: string; stage: string }>): Promise<void> {
    this.logger.log(`Processing Dunning Job ${job.id} for Invoice ${job.data.invoiceId}`);

    try {
      // Execute email delivery logic
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error.message}`);
      throw error; // Triggers BullMQ exponential backoff
    }
  }
}
```

---

## 🐳 Step 5: Docker & Deployment

### 📄 Production `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: invoice_saas_postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgrespassword
      POSTGRES_DB: invoicesaas_db
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d invoicesaas_db']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: invoice_saas_redis
    restart: always
    command: redis-server --appendonly yes
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: invoice_saas_app
    restart: always
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: 'postgresql://postgres:postgrespassword@postgres:5432/invoicesaas_db?schema=public'
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  bull-board:
    image: node:20-alpine
    container_name: invoice_saas_bull_board
    restart: always
    command: npx -y bull-board-cli --port 3001 --redis redis://redis:6379
    ports:
      - '3001:3001'
    depends_on:
      redis:
        condition: service_healthy

volumes:
  postgres_data:
  redis_data:
```
