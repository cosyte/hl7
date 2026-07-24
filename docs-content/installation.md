---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/hl7` is a **zero-dependency** TypeScript toolkit for Node.js. It ships dual **ESM + CJS**
builds with per-condition type declarations, so it works from either module system without
configuration.

> **Status:** published on npm at `0.0.1` and public, still pre-alpha on the
> `0.0.x`-until-first-alpha ladder. The `npm install` command below is live, not aspirational.

## Prerequisites

- **Node.js >= 22.** The whole `@cosyte/*` suite targets ES2023 / Node 22+.
- A package manager: `pnpm`, `npm`, or `yarn`.
- **No runtime dependencies.** Nothing else is pulled in; the parser is Node stdlib only.

## Install

```bash
npm install @cosyte/hl7
```

## Smoke test

Confirm the package resolves and its version symbol is present:

```ts runnable
import { VERSION } from "@cosyte/hl7";

typeof VERSION; // => "string"
```

If that resolves, the install is good. Head to the [Quickstart](./quickstart).

## Module systems

`@cosyte/hl7` is `"type": "module"` and exposes both conditions, so both of these resolve to the
right build without extra configuration:

```ts
// ESM / TypeScript
import { parseHL7 } from "@cosyte/hl7";
```

```js
// CommonJS
const { parseHL7 } = require("@cosyte/hl7");
```

The types are published per-condition (`.d.ts` for `import`, `.d.cts` for `require`) and gated by
`attw` on every release, so editor IntelliSense matches the build you actually load.
