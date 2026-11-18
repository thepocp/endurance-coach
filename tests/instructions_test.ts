import { assert } from "@std/assert";
import { instructions } from "../src/instructions.ts";

// Claude Code cuts MCP server instructions at this length without a warning.
const CLAUDE_CODE_LIMIT = 4096;

Deno.test("coaching rules fit into what Claude Code passes to the model", () => {
  const { length } = instructions("Brazilian Portuguese");
  assert(length <= CLAUDE_CODE_LIMIT, `${length} characters`);
});
