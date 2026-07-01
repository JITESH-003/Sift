import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../dist/app.module.js";
import { LlmService } from "../dist/llm/llm.service.js";
import { SafetyService } from "../dist/safety/safety.service.js";
import { TargetDbService } from "../dist/datasources/target-db.service.js";
import { IntrospectionService } from "../dist/datasources/introspection.service.js";
import { EmbeddingService } from "../dist/rag/embedding.service.js";

const TRAIN = [
  { question: "Total number of orders", sql: "SELECT count(*) AS n FROM demo.orders" },
  { question: "Total revenue from all orders", sql: "SELECT sum(total) AS revenue FROM demo.orders" },
  {
    question: "Top 3 products by revenue",
    sql: "SELECT p.name, sum(oi.line_total) AS revenue FROM demo.order_items oi JOIN demo.products p ON p.id = oi.product_id GROUP BY p.name ORDER BY revenue DESC LIMIT 3",
  },
  { question: "Number of orders by status", sql: "SELECT status, count(*) AS n FROM demo.orders GROUP BY status" },
  {
    question: "Revenue by month",
    sql: "SELECT date_trunc('month', created_at) AS month, sum(total) AS revenue FROM demo.orders GROUP BY month ORDER BY month",
  },
  { question: "Number of customers per country", sql: "SELECT country, count(*) AS n FROM demo.customers GROUP BY country ORDER BY n DESC" },
  {
    question: "Revenue per category",
    sql: "SELECT c.name, sum(oi.line_total) AS revenue FROM demo.order_items oi JOIN demo.products p ON p.id = oi.product_id JOIN demo.categories c ON c.id = p.category_id GROUP BY c.name ORDER BY revenue DESC",
  },
  {
    question: "Top 5 customers by number of orders",
    sql: "SELECT c.name, count(*) AS orders FROM demo.orders o JOIN demo.customers c ON c.id = o.customer_id GROUP BY c.name ORDER BY orders DESC LIMIT 5",
  },
];

const TEST = [
  { question: "How many customers do we have?", reference: "SELECT count(*) AS n FROM demo.customers" },
  {
    question: "What is the total revenue from completed orders?",
    reference: "SELECT sum(total) AS revenue FROM demo.orders WHERE status = 'completed'",
  },
  {
    question: "How many orders were cancelled or refunded?",
    reference: "SELECT count(*) AS n FROM demo.orders WHERE status IN ('cancelled','refunded')",
  },
  {
    question: "List the top 5 products by total quantity sold.",
    reference:
      "SELECT p.name, sum(oi.quantity) AS qty FROM demo.order_items oi JOIN demo.products p ON p.id = oi.product_id GROUP BY p.name ORDER BY qty DESC LIMIT 5",
  },
  {
    question: "What is the revenue per product category for completed orders?",
    reference:
      "SELECT c.name, sum(oi.line_total) AS revenue FROM demo.order_items oi JOIN demo.products p ON p.id = oi.product_id JOIN demo.categories c ON c.id = p.category_id JOIN demo.orders o ON o.id = oi.order_id WHERE o.status = 'completed' GROUP BY c.name ORDER BY revenue DESC",
  },
  {
    question: "Which country has the most customers?",
    reference: "SELECT country, count(*) AS n FROM demo.customers GROUP BY country ORDER BY n DESC LIMIT 1",
  },
  {
    question: "What is the average order value for completed orders?",
    reference: "SELECT avg(total) AS aov FROM demo.orders WHERE status = 'completed'",
  },
  {
    question: "How many orders were placed each month in 2025?",
    reference:
      "SELECT date_trunc('month', created_at) AS month, count(*) AS n FROM demo.orders WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01' GROUP BY month ORDER BY month",
  },
  { question: "What is the largest single order total?", reference: "SELECT max(total) AS m FROM demo.orders" },
  {
    question: "How many products are in the Electronics category?",
    reference:
      "SELECT count(*) AS n FROM demo.products p JOIN demo.categories c ON c.id = p.category_id WHERE c.name = 'Electronics'",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function normVal(v) {
  if (v === null || v === undefined) return "∅";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))
    return String(Math.round(parseFloat(v) * 100) / 100);
  return String(v).trim();
}
function normRows(rows) {
  return rows
    .map((r) => JSON.stringify(Object.values(r).map(normVal).sort()))
    .sort();
}
function rowsEqual(a, b) {
  const na = normRows(a);
  const nb = normRows(b);
  return na.length === nb.length && JSON.stringify(na) === JSON.stringify(nb);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error"],
  });
  const llm = app.get(LlmService);
  const safety = app.get(SafetyService);
  const targetDb = app.get(TargetDbService);
  const introspection = app.get(IntrospectionService);
  const embeddings = app.get(EmbeddingService);

  const evalModel = process.env.EVAL_MODEL || undefined;
  console.log(`model: ${evalModel ?? "(provider default)"}`);

  const target = {
    connectionString: targetDb.appConnectionString(),
    schema: "demo",
    readonlyRole: true,
  };
  const { compactText } = await introspection.introspect(target);

  async function exec(sql) {
    const verdict = safety.validate(sql);
    if (!verdict.ok) return { error: `blocked: ${verdict.reason}` };
    try {
      const { rows } = await targetDb.runReadOnly(target, verdict.sql);
      return { rows };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  console.log("Embedding training examples for retrieval…");
  const trainVecs = await embeddings.embedPassages(TRAIN.map((t) => t.question));

  const modes = [
    { name: "baseline", useRag: false },
    { name: "rag", useRag: true },
  ];
  const results = {};

  for (const mode of modes) {
    let correct = 0;
    console.log(`\n=== ${mode.name.toUpperCase()} ===`);
    for (const test of TEST) {
      let examples = [];
      if (mode.useRag) {
        const qv = await embeddings.embedQuery(test.question);
        examples = TRAIN.map((t, i) => ({ t, s: dot(qv, trainVecs[i]) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
          .map((x) => ({ question: x.t.question, sql: x.t.sql }));
      }
      let ok = false;
      let note = "";
      try {
        const gen = await llm.generateSql(compactText, test.question, {
          examples,
          model: evalModel,
        });
        const got = await exec(gen.sql);
        const ref = await exec(test.reference);
        if (ref.error) note = `REF ERROR: ${ref.error}`;
        else if (got.error) note = got.error;
        else ok = rowsEqual(got.rows, ref.rows);
      } catch (e) {
        note = e instanceof Error ? e.message : String(e);
      }
      if (ok) correct++;
      console.log(
        `  ${ok ? "✓" : "✗"}  ${test.question}${note ? `  (${note})` : ""}`,
      );
      await sleep(400);
    }
    const pct = Math.round((correct / TEST.length) * 100);
    results[mode.name] = { correct, pct };
    console.log(`  → ${correct}/${TEST.length} (${pct}%)`);
  }

  const bar = (pct) => "█".repeat(Math.round(pct / 5)).padEnd(20, "·");
  console.log("\n──────── execution accuracy ────────");
  console.log(
    `  baseline  ${bar(results.baseline.pct)} ${results.baseline.pct}%`,
  );
  console.log(`  + RAG     ${bar(results.rag.pct)} ${results.rag.pct}%`);
  const delta = results.rag.pct - results.baseline.pct;
  console.log(
    `  lift: ${delta >= 0 ? "+" : ""}${delta} points from retrieval\n`,
  );

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
