import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pgQuery from "pg-query-emscripten";

test("Supabase migration is valid PostgreSQL syntax", async () => {
  const parser = await pgQuery();
  const sql = await readFile(new URL("../supabase/migrations/202608290001_initial_schema.sql", import.meta.url), "utf8");
  const result = parser.parse(sql);
  assert.equal(result.error, null, result.error?.message);
  assert.ok(result.parse_tree.stmts.length > 100);
  // pg-query-emscripten mutates its WASM state while parsing; use an isolated
  // instance for PL/pgSQL instead of reusing the SQL parser instance.
  const plpgsqlParser = await pgQuery();
  const plpgsql = plpgsqlParser.parsePlpgsql(sql);
  assert.equal(plpgsql.error, null, plpgsql.error?.message);
  assert.ok(plpgsql.plpgsql_funcs.length >= 10);
});
