# Multi-File Skill Import Design

**Date:** 2026-06-22  
**Branch:** l-02-home-work  
**Scope:** `server/src/modules/skills/import.service.ts` only — no DB, no contracts, no client changes.

## Problem

The current ZIP import treats every `.md` file in the archive as a separate skill. This prevents structured, directory-based skills (like the Claude Code superpowers format) where one skill is composed of a primary `SKILL.md` file that references additional supporting files.

## Solution

Treat each directory containing a `SKILL.md` as a single skill. Assemble the skill body from `SKILL.md` and any files listed in its frontmatter `includes:` field. Everything else in the archive is ignored.

## Archive Layout

```text
archive.zip
├── typescript-conventions/
│   ├── SKILL.md          ← entry point (frontmatter: name, description, type, includes)
│   ├── examples.md       ← listed in includes
│   └── config.md         ← listed in includes
├── security-rules/
│   └── SKILL.md          ← entry with no includes — single-file skill
├── README.md             ← ignored (loose file at root, no parent SKILL.md)
└── orphan.md             ← ignored (same reason)
```

## `SKILL.md` Frontmatter

```yaml
---
name: TypeScript Conventions
description: Enforces team TypeScript coding standards
type: convention
includes:
  - examples.md
  - config.md
---

Main skill body content here...
```

All frontmatter fields are optional with the same fallbacks as today (`name` falls back to directory name, `type` defaults to `custom`, `description` defaults to `''`).

## Assembly Algorithm

For each `SKILL.md` found in the archive:

1. Parse frontmatter → extract `name`, `description`, `type`, `includes: string[]`
2. `body` = SKILL.md content with the frontmatter block stripped
3. For each path in `includes` (resolved relative to the skill's directory):
   - Look up in the in-memory `Map<path, content>`
   - If found: append `\n\n` + file content to body
   - If missing: skip silently (no error — partial assembly is acceptable)
4. Return one `SkillPreview` per `SKILL.md` found

Includes are resolved one level deep only — an included file cannot itself include other files.

## Name Fallback

1. `name:` from `SKILL.md` frontmatter
2. Immediate parent directory name, kebab/underscore converted to words (`typescript-conventions` → `typescript conventions`). For `outer/inner/SKILL.md` the name is derived from `inner`, not `outer`.

## `SkillPreview` Fields

| Field         | Value                                              |
| ------------- | -------------------------------------------------- |
| `name`        | From frontmatter or directory name                 |
| `description` | From frontmatter or `''`                           |
| `type`        | From frontmatter or `'custom'`                     |
| `body`        | Assembled content (SKILL.md body + included files) |
| `source`      | `'imported_file'` (unchanged)                      |
| `filename`    | Directory path (e.g. `typescript-conventions/`)    |

## Edge Cases

| Situation                                                    | Behaviour                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| File listed in `includes` is absent from ZIP                 | Skipped, rest of body assembled normally                      |
| `includes` field present but empty list                      | Only `SKILL.md` body used                                     |
| `SKILL.md` at ZIP root (no parent directory)                 | Ignored — strict directory-only mode                          |
| Directory with no `SKILL.md`                                 | Ignored                                                       |
| `includes` path escapes the skill directory (`../other.md`)  | Ignored — path traversal protection                           |
| ZIP has no directories with `SKILL.md`                       | `previewFromZip()` returns `[]`; client shows "no skills found" |

## What Does Not Change

- `previewFromUrl()` — single-file fetch only; no change
- `previewFromFile()` for a single `.md` upload — no change
- Confirm step (`/skills/import/confirm`) — no change
- DB schema, Zod contracts, client code — no change

## Implementation Boundary

All changes are confined to `server/src/modules/skills/import.service.ts`, specifically the `previewFromZip()` method (and any private helpers it calls). Existing tests in `import.service.test.ts` may need updating to match the new strict-directory behaviour.
