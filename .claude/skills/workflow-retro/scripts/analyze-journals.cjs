#!/usr/bin/env node
/**
 * Deep-parse Claude Code agent journals for a workflow retrospective.
 *
 * Read-only, zero dependencies (Node builtins only: fs, path). Node, not Python -
 * this repo guarantees Node >= 22 (CLAUDE.md "Stack"), Python is NOT guaranteed and
 * was confirmed absent on the dev machine this skill was authored on. Reads subagent
 * journal files (`agent-<id>.jsonl`) and/or a main-session transcript
 * (`<session>.jsonl`), and aggregates per-agent and total:
 *   - token usage (input / output / cache-read / cache-creation)
 *   - two cache-ratio metrics (see CACHE_RATIO_NOTE below)
 *   - tool-call count
 *   - wall-clock span (first -> last timestamp)
 *   - model(s) used
 *   - an OPTIONAL cost estimate (only when a price map is supplied via --prices)
 *
 * `workflow-retro` calls this in `deep` mode; the default mode reads usage straight
 * from the orchestrator's in-context Agent-tool results instead (zero file reads,
 * cheaper, but undercounts nested sub-agents - see NESTED_AGENT_NOTE).
 *
 * CACHE_RATIO_NOTE: two conventions exist for "cache hit ratio" and they answer
 * different questions (Anthropic Console dashboard vs SDK-instrumentation guides use
 * different denominators). This script reports BOTH:
 *   - readRatio = cacheRead / (input + cacheRead + cacheWrite)  [overall cost efficiency]
 *   - hitRate   = cacheRead / (cacheRead + cacheWrite)          [cache mechanism health]
 * `workflow-retro`'s report uses `readRatio` as its headline "cache hit %" and mentions
 * `hitRate` as a secondary figure - state which one you're quoting if you cite this data.
 *
 * NESTED_AGENT_NOTE: a parent agent's own `<usage>` block (visible in-context) reports
 * ONLY its own turns, never its children's. Journals are stored FLAT under `subagents/`,
 * so a directory listing already includes every nesting level; each journal has a
 * sibling `<journal>.meta.json` carrying `agentType` + `spawnDepth` (1 = spawned by the
 * main session, >1 = spawned by another sub-agent). This script sums ALL depths into
 * the total and reports `nestedAgents` / `maxDepth` separately so nothing is silently
 * lost, mirroring the parent-child span-tree rollup pattern used by OpenTelemetry
 * GenAI conventions / LangSmith / Braintrust for multi-agent cost attribution.
 *
 * Usage:
 *   node analyze-journals.cjs <file-or-simple-glob> [...more] [--json] [--prices prices.json]
 *
 * Only a minimal glob is supported (a single trailing `*` in the filename, e.g.
 * `subagents/agent-*.jsonl`) - resolved via a plain directory listing, no glob lib.
 *
 * Locating the journals (path differs by OS - the skill figures this out before
 * calling this script; this script itself does no path guessing):
 *   macOS/Linux: ~/.claude/projects/<project-slug>/<session-id>/subagents/agent-*.jsonl
 *   Windows:     %USERPROFILE%\.claude\projects\<project-slug>\<session-id>\subagents\agent-*.jsonl
 *
 * Cost: pricing is NOT hard-coded (it drifts). Pass --prices with a JSON map of
 * {model_substring: {"in": $/Mtok, "out": $/Mtok, "cache_read": $/Mtok, "cache_write": $/Mtok}};
 * verify current numbers via the `claude-api` skill first. Without --prices, cost is "n/a".
 */
'use strict';

const fs = require('fs');
const path = require('path');

function expandSimpleGlob(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const dir = path.dirname(pattern);
  const base = path.basename(pattern);
  const re = new RegExp('^' + base.split('*').map(escapeRegExp).join('.*') + '$');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((f) => re.test(f)).map((f) => path.join(dir, f));
}

function escapeRegExp(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function agentLabel(filePath) {
  const base = path.basename(filePath);
  if (base.startsWith('agent-') && base.endsWith('.jsonl')) {
    return base.slice('agent-'.length, -'.jsonl'.length);
  }
  return base.endsWith('.jsonl') ? base.slice(0, -'.jsonl'.length) : base;
}

function loadMeta(filePath) {
  const metaPath = filePath.endsWith('.jsonl')
    ? filePath.slice(0, -'.jsonl'.length) + '.meta.json'
    : filePath + '.meta.json';
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return {};
  }
}

function accumulate(filePath) {
  const meta = loadMeta(filePath);
  const agg = {
    agent: agentLabel(filePath),
    type: meta.agentType || null,
    desc: meta.description || null,
    depth: meta.spawnDepth || 1,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    toolCalls: 0,
    assistantTurns: 0,
    models: new Set(),
    tsFirst: null,
    tsLast: null,
    lines: 0,
  };
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    agg.lines += 1;
    let o;
    try {
      o = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (o.timestamp) {
      const ts = new Date(o.timestamp);
      if (!Number.isNaN(ts.getTime())) {
        if (!agg.tsFirst || ts < agg.tsFirst) agg.tsFirst = ts;
        if (!agg.tsLast || ts > agg.tsLast) agg.tsLast = ts;
      }
    }
    const msg = o.message;
    if (!msg || typeof msg !== 'object') continue;
    if (msg.model) agg.models.add(msg.model);
    const usage = msg.usage;
    if (usage) {
      agg.assistantTurns += 1;
      agg.input += usage.input_tokens || 0;
      agg.output += usage.output_tokens || 0;
      agg.cacheRead += usage.cache_read_input_tokens || 0;
      agg.cacheWrite += usage.cache_creation_input_tokens || 0;
    }
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block && typeof block === 'object' && block.type === 'tool_use') {
          agg.toolCalls += 1;
        }
      }
    }
  }
  return agg;
}

function priceFor(model, prices) {
  if (!prices || !model) return null;
  for (const [key, p] of Object.entries(prices)) {
    if (model.includes(key)) return p;
  }
  return null;
}

function costOf(agg, prices) {
  const model = agg.models.size ? [...agg.models].sort()[0] : null;
  const p = priceFor(model, prices);
  if (!p) return null;
  const m = 1_000_000;
  return (
    (agg.input / m) * (p.in || 0) +
    (agg.output / m) * (p.out || 0) +
    (agg.cacheRead / m) * (p.cache_read || 0) +
    (agg.cacheWrite / m) * (p.cache_write || 0)
  );
}

function spanSeconds(agg) {
  if (agg.tsFirst && agg.tsLast) return (agg.tsLast - agg.tsFirst) / 1000;
  return null;
}

function fmtInt(n) {
  return n.toLocaleString('en-US');
}

function parseArgs(argv) {
  const args = { paths: [], json: false, prices: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--prices') args.prices = argv[++i];
    else args.paths.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.paths.length === 0) {
    console.error('usage: node analyze-journals.cjs <file-or-simple-glob> [...] [--json] [--prices prices.json]');
    return 1;
  }

  let prices = null;
  if (args.prices) {
    prices = JSON.parse(fs.readFileSync(args.prices, 'utf8'));
  }

  const files = [...new Set(args.paths.flatMap(expandSimpleGlob))].sort();

  const rows = [];
  for (const f of files) {
    const agg = accumulate(f);
    if (agg && agg.lines > 0) rows.push(agg);
  }

  if (rows.length === 0) {
    console.error('no readable journal files matched');
    return 1;
  }

  rows.sort((a, b) => (a.tsFirst || Infinity) - (b.tsFirst || Infinity));

  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, toolCalls: 0, cost: 0, hasCost: false };
  let sumSpan = 0;
  let wallFirst = null;
  let wallLast = null;

  const outRows = [];
  for (const a of rows) {
    const c = costOf(a, prices);
    const sp = spanSeconds(a);
    if (sp) sumSpan += sp;
    if (a.tsFirst && (!wallFirst || a.tsFirst < wallFirst)) wallFirst = a.tsFirst;
    if (a.tsLast && (!wallLast || a.tsLast > wallLast)) wallLast = a.tsLast;
    const denomAll = a.input + a.cacheRead + a.cacheWrite;
    const readRatio = denomAll ? a.cacheRead / denomAll : 0;
    const denomMech = a.cacheRead + a.cacheWrite;
    const hitRate = denomMech ? a.cacheRead / denomMech : 0;
    total.input += a.input;
    total.output += a.output;
    total.cacheRead += a.cacheRead;
    total.cacheWrite += a.cacheWrite;
    total.toolCalls += a.toolCalls;
    if (c !== null) {
      total.cost += c;
      total.hasCost = true;
    }
    outRows.push({
      agent: a.agent,
      type: a.type,
      desc: a.desc,
      depth: a.depth,
      model: a.models.size ? [...a.models].sort()[0] : null,
      input: a.input,
      output: a.output,
      cacheRead: a.cacheRead,
      cacheWrite: a.cacheWrite,
      readRatio: Math.round(readRatio * 1000) / 1000,
      hitRate: Math.round(hitRate * 1000) / 1000,
      toolCalls: a.toolCalls,
      turns: a.assistantTurns,
      spanS: sp !== null ? Math.round(sp * 10) / 10 : null,
      started: a.tsFirst ? a.tsFirst.toISOString() : null,
      costUsd: c !== null ? Math.round(c * 10000) / 10000 : null,
    });
  }

  const wall = wallFirst && wallLast ? (wallLast - wallFirst) / 1000 : null;
  const parallelism = wall && wall > 0 ? Math.round((sumSpan / wall) * 100) / 100 : null;
  const totDenomAll = total.input + total.cacheRead + total.cacheWrite;
  const totReadRatio = totDenomAll ? Math.round((total.cacheRead / totDenomAll) * 1000) / 1000 : 0;
  const totDenomMech = total.cacheRead + total.cacheWrite;
  const totHitRate = totDenomMech ? Math.round((total.cacheRead / totDenomMech) * 1000) / 1000 : 0;
  const maxDepth = Math.max(...outRows.map((r) => r.depth || 1));
  const nested = outRows.filter((r) => (r.depth || 1) > 1).length;
  const critical = outRows.reduce(
    (best, r) => ((r.spanS || 0) > (best?.spanS || 0) ? r : best),
    null
  );

  const summary = {
    agents: outRows.length,
    nestedAgents: nested,
    maxDepth,
    input: total.input,
    output: total.output,
    cacheRead: total.cacheRead,
    cacheWrite: total.cacheWrite,
    readRatio: totReadRatio,
    hitRate: totHitRate,
    toolCalls: total.toolCalls,
    wallS: wall !== null ? Math.round(wall * 10) / 10 : null,
    sumAgentSpanS: Math.round(sumSpan * 10) / 10,
    parallelism,
    criticalPathAgent: critical ? critical.agent : null,
    criticalPathSpanS: critical ? critical.spanS : null,
    costUsd: total.hasCost ? Math.round(total.cost * 10000) / 10000 : null,
  };

  if (args.json) {
    console.log(JSON.stringify({ agents: outRows, summary }, null, 2));
    return 0;
  }

  const header = `${'agent (indent = nested)'.padEnd(30)} ${'type'.padEnd(14)} ${'in'.padStart(9)} ${'out'.padStart(8)} ${'c-read'.padStart(9)} ${'read%'.padStart(6)} ${'tools'.padStart(5)} ${'span'.padStart(7)} ${'cost'.padStart(8)}`;
  console.log(header);
  console.log('-'.repeat(108));
  for (const r of outRows) {
    const depth = r.depth || 1;
    const indent = '  '.repeat(depth - 1) + (depth > 1 ? '> ' : '');
    const name = (indent + r.agent).slice(0, 30).padEnd(30);
    const spanStr = r.spanS !== null ? `${r.spanS}s` : '-';
    const costStr = r.costUsd !== null ? `$${r.costUsd.toFixed(4)}` : 'n/a';
    console.log(
      `${name} ${(r.type || '?').slice(0, 14).padEnd(14)} ` +
        `${fmtInt(r.input).padStart(9)} ${fmtInt(r.output).padStart(8)} ` +
        `${fmtInt(r.cacheRead).padStart(9)} ${(r.readRatio * 100).toFixed(0).padStart(5)}% ` +
        `${String(r.toolCalls).padStart(5)} ` +
        `${spanStr.padStart(7)} ` +
        `${costStr.padStart(8)}`
    );
  }
  console.log('-'.repeat(108));
  console.log(
    `TOTAL agents=${summary.agents} (nested=${summary.nestedAgents}, max_depth=${summary.maxDepth})  ` +
      `in=${fmtInt(summary.input)}  out=${fmtInt(summary.output)}  cache_read=${fmtInt(summary.cacheRead)}  ` +
      `read_ratio=${(summary.readRatio * 100).toFixed(0)}%  hit_rate=${(summary.hitRate * 100).toFixed(0)}%  ` +
      `tools=${summary.toolCalls}`
  );
  console.log(
    `      wall=${summary.wallS}s  sum_agent_span=${summary.sumAgentSpanS}s  parallelism=${summary.parallelism}x  ` +
      `critical_path=${summary.criticalPathAgent} (${summary.criticalPathSpanS}s)  ` +
      `cost=${summary.costUsd !== null ? '$' + summary.costUsd.toFixed(4) : 'n/a (pass --prices)'}`
  );
  console.log('note: totals INCLUDE all nested sub-agents (spawnDepth > 1). read_ratio and hit_rate');
  console.log("      are two different cache metrics - see CACHE_RATIO_NOTE in this file's header comment.");
  return 0;
}

process.exit(main());
