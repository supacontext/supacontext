# SupaContext

Developer API for giving AI agents compact, cited, up-to-date public context from web, Reddit, X, and YouTube.

This is not a raw search API, scraper, or data dump product. Public responses must return structured JSON context, not raw provider output.

Core product shape:
- One main context API.
- JSON output only.
- Sources: web, Reddit, X, YouTube.
- Depths: Fast, Standard, Thorough, Deep.
- Credit-based subscription pricing.
- Dashboard for keys, usage, playground, and billing.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them, don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No configurability that was not requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't improve adjacent code, comments, or formatting.
- Don't refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it, don't delete it.

When your changes create orphans:
- Remove imports, variables, functions, and files that your changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the task.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" means write tests for invalid inputs, then make them pass.
- "Fix the bug" means write a test that reproduces it, then make it pass.
- "Refactor X" means ensure tests pass before and after.

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
````

Weak criteria like "make it work" require clarification.

## 5. Security

Convenient but never insecure.

This includes things like:
* Never expose service role keys to the client.
* Never log API keys, provider keys, webhook secrets, or payment secrets.
* Validate public API requests.
* Validate webhook signatures.
* Rate-limit public API routes.
* Use server-side data access for protected dashboard data.
* Verify resource ownership on dashboard actions.
* Sanitize URLs and platform inputs.

## 6. Development Stage

This app is in active development and has no production users yet.

* Do not optimize for backward compatibility unless asked.
* Do not add migrations, backfills, dual-write paths, or compatibility layers unless asked.
* If a schema or flow needs to change, update it directly to the desired clean state.
* Prefer clean implementation over preserving early bad decisions.
* Do not build speculative enterprise features.

## 11. Verification

Do not claim completion without verification.

* Run typecheck.
* Run lint.
* Run tests.
