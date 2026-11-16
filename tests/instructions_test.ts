import { assert } from "@std/assert";
import { INSTRUCTIONS } from "../src/instructions.ts";

// Claude Code cuts MCP server instructions at this length without a warning.
const CLAUDE_CODE_LIMIT = 4096;

Deno.test("coaching rules fit into what Claude Code passes to the model", () => {
  assert(
    INSTRUCTIONS.length <= CLAUDE_CODE_LIMIT,
    `${INSTRUCTIONS.length} characters`,
  );
});
