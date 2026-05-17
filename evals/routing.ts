import Anthropic from "@anthropic-ai/sdk";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CASES_PATH = join(__dirname, "routing.json");
const RESULTS_DIR = join(__dirname, "results");
const RESULTS_FILE = join(RESULTS_DIR, "routing.json");

const MODEL = process.env.PRAVA_EVAL_ROUTER_MODEL ?? "claude-opus-4-7";
const CONCURRENCY = Math.max(
  1,
  Number(process.env.PRAVA_EVAL_CONCURRENCY ?? 4),
);

interface RoutingCase {
  id: number;
  prompt: string;
  expected: string;
  category?: string;
}

interface RoutingFile {
  cases: RoutingCase[];
}

interface SkillInfo {
  name: string;
  description: string;
}

interface CaseResult {
  caseItem: RoutingCase;
  decision: string;
  rawResponse: string;
  pass: boolean;
  error?: string;
}

function extractFrontmatter(skillMdPath: string): SkillInfo | null {
  const content = readFileSync(skillMdPath, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const lines = fmMatch[1].split("\n");

  let name = "";
  let description = "";
  let inDescription = false;

  for (const line of lines) {
    if (line.startsWith("name:")) {
      name = line.slice("name:".length).trim();
      inDescription = false;
    } else if (line.startsWith("description:")) {
      description = line.slice("description:".length).trim();
      inDescription = true;
    } else if (inDescription) {
      if (/^[a-zA-Z][\w-]*:/.test(line) || line.trim() === "") {
        inDescription = false;
      } else {
        description += " " + line.trim();
      }
    }
  }

  if (!name) return null;
  return { name, description };
}

function discoverSkills(repoRoot: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = join(repoRoot, entry.name, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;
    const fm = extractFrontmatter(skillMdPath);
    if (fm) skills.push(fm);
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Export it before running this script.",
  );
  process.exit(1);
}

const client = new Anthropic();
const skills = discoverSkills(REPO_ROOT);
const casesFile: RoutingFile = JSON.parse(readFileSync(CASES_PATH, "utf-8"));

if (skills.length === 0) {
  console.error(`No skills discovered under ${REPO_ROOT}`);
  process.exit(1);
}

const skillList = skills
  .map((s) => `- ${s.name}: ${s.description}`)
  .join("\n");

const validDecisions = new Set([...skills.map((s) => s.name), "none"]);

const ROUTER_INSTRUCTION = `You are the routing layer of an AI agent runtime. The following skills are installed:

${skillList}

A user has just sent the message in the next turn. Decide which (if any) of these skills should be loaded to handle the message.

Reply with EXACTLY ONE of the following values, on a single line, with no prefix, suffix, quotes, or explanation:
${[...skills.map((s) => s.name), "none"].map((v) => `- ${v}`).join("\n")}

If no skill is a good match, reply with "none".`;

function normalizeDecision(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const firstLine = trimmed.split(/\r?\n/)[0];
  const firstToken = firstLine.split(/\s+/)[0] ?? "";
  return firstToken.replace(/[^\w-]/g, "");
}

async function routeOne(item: RoutingCase): Promise<CaseResult> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: ROUTER_INSTRUCTION,
      messages: [{ role: "user", content: item.prompt }],
    });
    const rawResponse = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const decision = normalizeDecision(rawResponse);
    const expected = item.expected.toLowerCase();
    const pass = decision === expected && validDecisions.has(decision);
    return { caseItem: item, decision, rawResponse, pass };
  } catch (err) {
    return {
      caseItem: item,
      decision: "",
      rawResponse: "",
      pass: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runAll(): Promise<void> {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const cases = casesFile.cases;
  console.log(
    `Routing eval: ${cases.length} cases against ${skills.length} skills (model=${MODEL}, concurrency=${CONCURRENCY})`,
  );
  console.log(`Skills: ${skills.map((s) => s.name).join(", ")}\n`);

  const results: CaseResult[] = [];
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIdx++;
      if (idx >= cases.length) return;
      const r = await routeOne(cases[idx]);
      results.push(r);
      const mark = r.pass ? "[ok]" : "[no]";
      console.log(
        `${mark} case ${String(r.caseItem.id).padStart(2)}  expected=${r.caseItem.expected.padEnd(24)} got=${r.decision || "(empty)"}`,
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker),
  );
  results.sort((a, b) => a.caseItem.id - b.caseItem.id);

  writeFileSync(
    RESULTS_FILE,
    JSON.stringify({ model: MODEL, skills, results }, null, 2),
  );

  const byCategory = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const cat = r.caseItem.category ?? "uncategorized";
    const bucket = byCategory.get(cat) ?? { pass: 0, total: 0 };
    bucket.total++;
    if (r.pass) bucket.pass++;
    byCategory.set(cat, bucket);
  }

  console.log("\n=== Per-category breakdown ===");
  for (const [cat, b] of byCategory) {
    console.log(`  ${cat.padEnd(28)} ${b.pass}/${b.total}`);
  }

  console.log("\n=== Failures ===");
  let anyFail = false;
  for (const r of results) {
    if (r.pass) continue;
    anyFail = true;
    console.log(
      `  case ${r.caseItem.id} (${r.caseItem.category ?? "uncategorized"})`,
    );
    console.log(`    prompt:   ${r.caseItem.prompt}`);
    console.log(`    expected: ${r.caseItem.expected}`);
    console.log(`    got:      ${r.decision || "(empty)"}`);
    if (r.error) console.log(`    error:    ${r.error}`);
    else if (r.rawResponse && r.rawResponse.trim() !== r.decision) {
      console.log(`    raw:      ${JSON.stringify(r.rawResponse)}`);
    }
  }
  if (!anyFail) console.log("  (none)");

  const passed = results.filter((r) => r.pass).length;
  const pct =
    results.length === 0
      ? "0.0"
      : ((passed / results.length) * 100).toFixed(1);
  console.log(`\nOverall: ${passed}/${results.length} (${pct}%)`);
  console.log(`Results: ${RESULTS_FILE}`);
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
