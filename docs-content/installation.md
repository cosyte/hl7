---
id: installation
title: Installation
sidebar_label: Installation
description: "Install the zero-dependency @cosyte/hl7 toolkit on Node.js 22 or later, with dual ESM and CJS builds and per-condition TypeScript declarations."
---

# Installation

`@cosyte/hl7` is a **zero-dependency** TypeScript toolkit for Node.js. It ships dual **ESM + CJS**
builds with per-condition type declarations, so it works from either module system without
configuration.

> **Status:** the 0.1 line, published on npm and public. The `npm install` command below is live. The
> exported functions, the message and helper surfaces, and the 20 stable warning codes are the
> surface we keep stable. Below 1.0 a breaking change can ship in a patch release, and the
> changelog says how to migrate, so pin the exact version rather than a caret range. For the current published version, ask the registry
> (`npm view @cosyte/hl7 version`) rather than this page.

## Prerequisites

- **Node.js 22 or later.** CI runs the tests on Node.js 22, 24 and 26. The package targets ES2023.
- A package manager: `pnpm`, `npm`, or `yarn`.
- **No runtime dependencies.** Nothing else is installed with it; it uses only Node.js built-ins.

## Install

```bash
npm install --save-exact @cosyte/hl7
```

`--save-exact` writes the version itself into `package.json` rather than a caret range such as
`^0.1.0`, which would take in a patch release, breaking or not, on the next install. Move the pin on
purpose, after reading the changelog. With pnpm it is `pnpm add --save-exact @cosyte/hl7`.

## Smoke test

Confirm the package resolves and its version symbol is present:

```ts runnable
import { VERSION } from "@cosyte/hl7";

typeof VERSION; // => "string"
```

If that resolves, the install is good. Head to the [Quickstart](./quickstart.md).

## Module systems

`@cosyte/hl7` is `"type": "module"` and exposes both conditions, so both of these resolve to the
right build without extra configuration:

```ts runnable
// ESM / TypeScript
import { parseHL7 } from "@cosyte/hl7";

typeof parseHL7; // => "function"
```

```js no-run CommonJS, and the sample runner loads every sample as an ES module
// CommonJS
const { parseHL7 } = require("@cosyte/hl7");
```

The types are published per condition (`.d.ts` for `import`, `.d.cts` for `require`), and
`pnpm attw` checks both before every release, so your editor's types match the build you load.
