import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, "..", "SKILL.md");
const REFERENCE_PATH = join(__dirname, "..", "references", "about-prava.md");
const EVALS_PATH = join(__dirname, "about-evals.json");

const PLANNER_MODEL =
  process.env.PRAVA_EVAL_PLANNER_MODEL ?? "claude-opus-4-7";
const JUDGE_MODEL = process.env.PRAVA_EVAL_JUDGE_MODEL ?? "claude-opus-4-7";
const CONCURRENCY = Math.max(
  1,
  Number(process.env.PRAVA_EVAL_CONCURRENCY ?? 4),
);

// Results nested by model so cross-model runs don't clobber each other.
const RESULTS_DIR = join(__dirname, "results-about", PLANNER_MODEL);

function supportsAdaptiveThinking(model: string): boolean {
  return /^claude-(opus-4-[67]|sonnet-4-6)/.test(model);
}

const plannerThinking = supportsAdaptiveThinking(PLANNER_MODEL)
  ? { thinking: { type: "adaptive" as const } }
  : {};
const judgeThinking = supportsAdaptiveThinking(JUDGE_MODEL)
  ? { thinking: { type: "adaptive" as const } }
  : {};

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
  answer: string;
  judgement: JudgeResult;
  error?: string;
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const client = new Anthropic();
const SKILL_CONTENT = readFileSync(SKILL_PATH, "utf-8");
const REFERENCE_CONTENT = readFileSync(REFERENCE_PATH, "utf-8");
const evalsFile: EvalsFile = JSON.parse(readFileSync(EVALS_PATH, "utf-8"));

// The agent has BOTH SKILL.md and the about-prava reference in context — this
// simulates the production state where the SKILL.md directive to "read the
// reference" has already been followed. We then test factual accuracy and
// behavior, not the decision to fetch the reference.
const ANSWER_INSTRUCTION = `
---

You are an AI agent that has loaded the prava-wallet skill (above) AND its about-prava reference file. The user message that follows is a question about Prava (the company / product) — NOT a request to make a purchase.

Answer the user's question directly and concisely, using the SKILL.md and reference content. Do NOT improvise facts not present in the reference. Do NOT run any \`prava\` CLI commands (the user is asking for information, not requesting a purchase). If the information isn't covered, say so plainly and direct the user to support@prava.space or https://docs.prava.space.

Reply with the answer you would send to the user, verbatim.`;

async function answerCase(item: EvalCase): Promise<string> {
  const res = await client.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 16000,
    ...plannerThinking,
    system: [
      {
        type: "text",
        text: SKILL_CONTENT,
      },
      {
        type: "text",
        text:
          "## Embedded reference: about-prava.md\n\n" + REFERENCE_CONTENT,
        cache_control: { type: "ephemeral" },
      },
      { type: "text", text: ANSWER_INSTRUCTION },
    ],
    messages: [{ role: "user", content: item.prompt }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function judgeCase(item: EvalCase, answer: string): Promise<JudgeResult> {
  const numbered = item.expectations
    .map((e, i) => `${i + 1}. ${e}`)
    .join("\n");

  const prompt = `You are a strict grader. Decide whether the agent's answer satisfies each expectation.

Below is the REFERENCE document the agent had access to. Use it to verify whether
specific claims in the answer are accurate or improvised:

=== REFERENCE START ===
${REFERENCE_CONTENT}
=== REFERENCE END ===

USER PROMPT
${item.prompt}

AGENT ANSWER
${answer}

EXPECTATIONS
${numbered}

Return ONLY valid JSON in exactly this shape (no markdown fences, no preamble):
{
  "results": [
    { "expectation": "<verbatim expectation text>", "pass": true | false, "reason": "<short citation from the answer or reference>" }
  ]
}

Rules:
- Be strict. If the answer is ambiguous, missing, or silent on an expectation, mark pass: false.
- For "does NOT improvise" expectations: a claim is improvised ONLY if it is NOT found in the reference. Specific facts that appear in the reference (e.g. "Skyflow", "PCI Level 2", "Chase and Ramp excluded", "above 90% success rate") are NOT improvisations — they are accurate citations.
- "reason" should quote or cite the part of the answer that supports your judgement.
- Return one entry per expectation, in the same order.
- Output JSON only.`;

  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 16000,
    ...judgeThinking,
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
    const answer = await answerCase(item);
    const judgement = await judgeCase(item, answer);
    return { caseItem: item, answer, judgement };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      caseItem: item,
      answer: "",
      judgement: { results: [] },
      error: message,
    };
  }
}

async function runAll(): Promise<void> {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const cases = evalsFile.evals;
  console.log(
    `About-Prava Q&A eval: ${cases.length} cases (planner=${PLANNER_MODEL}, judge=${JUDGE_MODEL}, concurrency=${CONCURRENCY})`,
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
          answer: r.answer,
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
