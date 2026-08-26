# Binary artifact safety

This document defines the safe way for AI-assisted work to inspect binary, compressed, database, archive, image, font, and Base64-encoded artifacts in this repository.

## Core rule

**Never load a large binary artifact or its Base64 representation directly into the chat/model context.**

Files such as SQLite databases, `.gz`, `.zip`, images, fonts, generated archives, and `*.b64` payloads must be treated as byte-oriented artifacts, not as ordinary UTF-8 source files.

## Required workflow

1. Inspect metadata first: path, type, size, checksum/commit, and whether the artifact is compressed or encoded.
2. Prefer a mounted/local working copy or a connector download/materialization API that returns a file reference or local path.
3. Decode/decompress locally in the working environment.
4. Inspect the resulting artifact with the appropriate native tool:
   - SQLite -> `sqlite3` / a SQLite library and targeted SQL queries;
   - archives -> list entries before extracting only what is needed;
   - images -> image inspection tools;
   - PDFs/documents -> file/document tools;
   - other binaries -> metadata or dedicated parsers.
5. Return only compact, task-relevant text to the model context.
6. For databases, start with schema/table discovery and then query only the tables, columns, rows, and date ranges relevant to the request.

## Forbidden patterns

- Do not call text-oriented `fetch_file`, blob/text fetch, `cat`, or equivalent on a large binary or Base64 checkpoint when the result will be injected into chat context.
- Do not print or echo an entire Base64 payload into logs or model-visible output.
- Do not retry the same oversized fetch after it has already produced a huge result. Change the retrieval method instead.
- Do not parse a binary database by searching its encoded representation as text.
- Do not infer that a successful textual fetch means the file was safely or correctly inspected.

## Repository checkpoint

The canonical database checkpoint pair is:

- `mafia_crm.checkpoint.sqlite.gz.b64`
- `mafia_crm.checkpoint.meta.json`

For historical inspection, the correct conceptual pipeline is:

`metadata -> local/downloaded .b64 file -> Base64 decode -> gzip decompress -> temporary SQLite -> targeted read-only SQL`

The temporary SQLite copy is for inspection only. Never restore it into production and never let checkpoint data overwrite a non-empty runtime database.

## Fail-safe behavior

If the available connector cannot materialize/download the artifact without returning its full payload into model context, **stop that retrieval path**. Use another byte-safe mechanism (local checkout, file materialization/download, CI-side targeted extraction, or ask for a direct file upload) rather than dumping the binary/Base64 content into the conversation.

If a tool unexpectedly returns an oversized payload, do not repeat the call. Record the failure mode, discard that route, and continue with a bounded alternative.
