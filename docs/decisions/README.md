# Architecture Decision Records (ADRs)

> **Last updated:** 2026-06-27

This directory records **significant, hard-to-reverse decisions** about how
Native is built — the *why* behind the architecture, not just the *what*.

An ADR is a short, immutable note. When a decision is superseded, we don't edit
the old record; we write a new ADR that references and replaces it (mirroring
Native's own "documents are never overwritten" principle).

## When to write an ADR

Write one when a choice:

- introduces or changes a workflow, status, document type, or permission model;
- chooses between meaningfully different approaches;
- establishes a convention others must follow;
- is expensive to undo later.

Routine fixes, copy and styling do **not** need an ADR.

## Format

Create `NNNN-short-title.md` (zero-padded, incrementing) with:

```markdown
# NNNN — Title

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD
- **Context:** What problem/forces led here.
- **Decision:** What we decided.
- **Consequences:** Trade-offs, what becomes easier/harder, follow-ups.
```

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-adopt-architecture-first-process.md) | Adopt an architecture-first development process | Accepted |
| [0002](./0002-two-step-dispatch-reconciliation.md) | Split dispatch reconciliation into Packing Slip + Sales Invoice | Accepted |
