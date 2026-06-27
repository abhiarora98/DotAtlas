# 0003 — Backend stack: PostgreSQL + Prisma + NestJS

- **Status:** Accepted
- **Date:** 2026-06-27

## Context

Native's business architecture is now well-documented and stable enough to design
the technical architecture that will implement it. Before writing backend code we
need a target stack so the backend design documents (`docs/backend/`) can be
concrete about API shape, data model, modules and jobs.

## Decision

Build the backend on:

- **PostgreSQL** — relational store. The model is inherently relational
  (orders → items → dispatches → packing slips → invoices → payments) and needs
  strong constraints, transactions and auditability. Postgres also gives us JSONB
  for flexible fields and good support for outbox/event patterns.
- **Prisma** — type-safe ORM and migration tool. Schema-as-code keeps the
  database design under version control alongside the docs, and generated types
  reduce drift between the data model and the application.
- **NestJS** — opinionated Node/TypeScript application framework. Its module
  system maps cleanly onto Native's department modules (Sales, Dispatch,
  Warehouse, Accounts), with dependency injection, guards (RBAC), interceptors
  (audit), pipes (validation) and a built-in event emitter / queue integration.

Supporting choices (detailed in the backend docs): object storage (S3-compatible)
for uploaded documents, a Redis-backed job queue (BullMQ) for background work, and
JWT-based authentication with role-based access control.

## Consequences

- One language (TypeScript) across the eventual SPA/back-office frontend and the
  backend, sharing types and validation logic.
- NestJS modules give us a natural place to enforce **module boundaries** and keep
  business logic in one place (Principle #1).
- Prisma migrations become the source of truth for the physical schema; the
  `docs/database` and `docs/backend/database-design.md` documents remain the
  *logical* source of truth that the schema must satisfy.
- We commit to a Node runtime and its operational model (process management,
  connection pooling via PgBouncer when needed).
- Implementation will proceed **one module at a time** only after the backend
  design documents are complete and reviewed.
