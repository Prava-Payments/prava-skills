import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, "..", "SKILL.md");
const EVALS_PATH = join(__dirname, "evals.json");
const RESULTS_DIR = join(__dirname, "results");

const PLANNER_MODEL =
  process.env.PRAVA_EVAL_PLANNER_MODEL ?? "claude-opus-4-7";
const JUDGE_MODEL = process.env.PRAVA_EVAL_JUDGE_MODEL ?? "claude-opus-4-7";
const CONCURRENCY = Math.max(
  1,
  Number(process.env.PRAVA_EVAL_CONCURRENCY ?? 4),
);

interface EvalCase {
  id: number;
  prompt: string;
  expected_output: string;
  expectations: string[];
}

interface EvalsFile {
  skill_name: string;
  evals: EvalCase[];
}

interface JudgeResult {
  results: Array<{
    expectation: string;
    pass: boolean;
    reason: string;
  }>;
}

interface CaseResult {
  caseItem: EvalCase;
  plan: string;
  judgement: JudgeResult;
  error?: string;
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Export it before running this script.",
  );
  process.exit(1);
}

const client = new Anthropic();
const SKILL_CONTENT = readFileSync(SKILL_PATH, "utf-8");
const evalsFile: EvalsFile = JSON.parse(readFileSync(EVALS_PATH, "utf-8"));

const PLANNER_INSTRUCTION = `
---

You are an AI agent that has just loaded the skill above. A user message will follow.

Do NOT execute any tools, run any commands, or attempt to make any external calls.
Instead, produce a detailed PLAN that lists, in execution order:
1. Each bash command you would run, with every flag and argument written verbatim.
2. Each user-facing message you would send (quote the message).
3. Any branching logic ("if 'prava status' returns pending, then ...").

Be exhaustive. Name every flag value, every product JSON, every currency / country code, every conditional branch.
The plan will be graded against a strict checklist, so omissions count as failures.`;

async function planCase(item: EvalCase): Promise<string> {
  const res = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SKILL_CONTENT,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: PLANNER_INSTRUCTION },
    ],
    messages: [{ role: "user", content: item.prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function judgeCase(item: EvalCase, plan: string): Promise<JudgeResult> {
  const numbered = item.expectations
    .map((e, i) => `${i + 1}. ${e}`)
    .join("\n");

  const prompt = `You are a strict grader. Decide whether the agent's plan satisfies each expectation.

USER PROMPT
${item.prompt}

AGENT PLAN
${plan}

EXPECTATIONS
${numbered}

Return ONLY valid JSON in exactly this shape (no markdown fences, no preamble):
{
  "results": [
    { "expectation": "<verbatim expectation text>", "pass": true | false, "reason": "<short citation from the plan>" }
  ]
}

Rules:
- Be strict. If the plan is ambiguous or silent on an expectation, mark pass: false.
- "reason" should quote or cite the part of the plan that supports your judgement.
- Return one entry per expectation, in the same order.
- Output JSON only.`;

  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

async function runCase(item: EvalCase): Promise<CaseResult> {
  try {
    const plan = await planCase(item);
    const judgement = await judgeCase(item, plan);
    return { caseItem: item, plan, judgement };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      caseItem: item,
      plan: "",
      judgement: { results: [] },
      error: message,
    };
  }
}

async function runAll(): Promise<void> {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const cases = evalsFile.evals;
  console.log(
    `Running ${cases.length} cases (planner=${PLANNER_MODEL}, judge=${JUDGE_MODEL}, concurrency=${CONCURRENCY})`,
  );

  const results: CaseResult[] = [];
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= cases.length) return;
      const item = cases[idx];
      const r = await runCase(item);
      results.push(r);
      if (r.error) {
        console.log(`case ${item.id}  ERROR  ${r.error}`);
      } else {
        const passed = r.judgement.results.filter((x) => x.pass).length;
        const total = r.judgement.results.length;
        console.log(`case ${item.id}  ${passed}/${total}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker),
  );

  results.sort((a, b) => a.caseItem.id - b.caseItem.id);

  for (const r of results) {
    const filename = `case-${String(r.caseItem.id).padStart(2, "0")}.json`;
    writeFileSync(
      join(RESULTS_DIR, filename),
      JSON.stringify(
        {
          case: r.caseItem,
          plan: r.plan,
          judgement: r.judgement,
          error: r.error,
        },
        null,
        2,
      ),
    );
  }

  let totalExpect = 0;
  let totalPass = 0;
  console.log("\n=== Results ===\n");
  for (const r of results) {
    if (r.error) {
      console.log(`Case ${r.caseItem.id}: ERROR — ${r.error}\n`);
      continue;
    }
    const passed = r.judgement.results.filter((x) => x.pass).length;
    const total = r.judgement.results.length;
    totalExpect += total;
    totalPass += passed;
    const status = passed === total ? "PASS" : `FAIL (${passed}/${total})`;
    console.log(`Case ${r.caseItem.id}: ${status}`);
    for (const item of r.judgement.results) {
      const mark = item.pass ? "  [ok]" : "  [no]";
      console.log(`${mark} ${item.expectation}`);
      if (!item.pass) console.log(`        -> ${item.reason}`);
    }
    console.log("");
  }

  const pct =
    totalExpect === 0
      ? "0.0"
      : ((totalPass / totalExpect) * 100).toFixed(1);
  console.log(
    `Overall: ${totalPass}/${totalExpect} expectations passed (${pct}%)`,
  );
  console.log(`Per-case results: ${RESULTS_DIR}`);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
