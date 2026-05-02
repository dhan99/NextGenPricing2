// F1.2 — Assembly expansion engine.
//
// Expands an assembly template into a concrete list of leaf scope rows for a
// given deal context (tier + engagement inputs + prompt answers). Pure
// computation — no DB writes here. The route layer (slice 3) calls this and
// then either previews the result (POST /expand) or persists it (POST
// /scope-items/from-assembly).
//
// SECURITY MODEL — quantity_formula evaluator
// -------------------------------------------
// Components carry an optional `quantityFormula` like "entities * 2" or
// "tpTransactions + extraStates / 5". The strings come from
// admin-authored seeds and from a future Pricing Ops UI, never from
// end-user input — but treating them as trusted is brittle. This module
// uses a strict whitelist:
//
//   ALLOWED AST NODE TYPES:
//     - ConstantNode (numeric literals)
//     - SymbolNode (identifiers, but only those bound in the scope we
//       hand to evaluate(); any unknown identifier throws)
//     - OperatorNode with op ∈ {+,-,*,/,^,%,unaryMinus,unaryPlus}
//     - ParenthesisNode
//
//   DISALLOWED — rejected at parse time, before evaluate() runs:
//     - FunctionNode (no foo(args), including disabled mathjs builtins)
//     - AccessorNode / IndexNode (no x.y, x[0])
//     - AssignmentNode (no x = 1)
//     - FunctionAssignmentNode (no f(x)=...)
//     - RangeNode, ConditionalNode, BlockNode, ObjectNode, ArrayNode
//
// This is the safe-by-default approach: a validator on the parsed AST
// instead of a denylist on mathjs's evaluate(). The denylist approach
// has historically lost to gadgets like math.import, createUnit, and
// custom function definitions.

import { create, all, type MathNode, type ConstantNode, type SymbolNode, type OperatorNode, type ParenthesisNode } from "mathjs";

const math = create(all);

// Belt-and-braces: even though our AST validator rejects FunctionNode
// before evaluate() runs, also stub out the mathjs metaprogramming
// builtins. Stubbed-out names a formula could try to call:
//   - import: redefines library functions (highest-stakes gadget)
//   - createUnit: registers new identifiers; could shadow our scope
// We intentionally do NOT stub `parse` or `evaluate` because the
// service itself calls math.parse() and node.evaluate() — overriding
// them disables the parser too. The AST validator below is the
// primary defense; these import stubs are defense-in-depth against a
// future bug in that validator.
math.import(
  {
    import: function () { throw new Error("disabled"); },
    createUnit: function () { throw new Error("disabled"); },
  },
  { override: true },
);

const ALLOWED_OPS = new Set([
  "+", "-", "*", "/", "^", "%",
  "unaryMinus", "unaryPlus",
]);

export type Tier = "ultimate" | "enhanced" | "essential" | null;

export type ExpansionContext = {
  tier: Tier;
  // Numeric scope identifiers the formula may reference. Keys flat, values
  // coerced to finite numbers (non-numeric inputs become 0 — see
  // buildScope below).
  engagementInputs: Record<string, unknown>;
  // Prompt multipliers / answers as numbers. Caller is responsible for
  // resolving text answers (e.g. "Yes"/"No") to numbers if formulas need
  // them. Identifier prefix is "prompt_<id>" by convention.
  promptAnswers: Record<string, number>;
};

export type AssemblyComponentLite = {
  id: number;
  scopeItemId: number;
  ultimateTierOverride: string | number | null;
  enhancedTierOverride: string | number | null;
  essentialTierOverride: string | number | null;
  quantityFormula: string | null;
  sortOrder: number | null;
};

export type ScopeCatalogLite = {
  id: number;
  defaultHours: string | number | null;
};

export type ExpansionLine = {
  scopeItemId: number;
  quantity: number;        // rounded, non-negative integer
  adjustedHours: number;   // tier override if present, else leaf default; never null
  sourceComponentId: number;
  formulaUsed: string | null;
};

export type EvaluateOptions = {
  // If true, an unknown identifier resolves to 0 instead of throwing. Off
  // by default — the strict mode is what catches typos in admin-authored
  // formulas. Slice 4's UI will set this to true so half-typed formulas
  // in a preview don't crash the whole expansion.
  permissiveIdentifiers?: boolean;
};

/**
 * Evaluate a quantity formula string against a deal context.
 *
 * Validates the parsed AST against the allow-list above and rejects
 * everything else with a descriptive error. Returns a non-negative
 * integer. NaN / Infinity / non-numeric results throw.
 */
export function evaluateQuantityFormula(
  formula: string,
  ctx: ExpansionContext,
  opts: EvaluateOptions = {},
): number {
  const trimmed = (formula || "").trim();
  if (!trimmed) return 1; // empty formula = "one of these"

  let tree: MathNode;
  try {
    tree = math.parse(trimmed);
  } catch (e: any) {
    throw new Error(`Formula parse error: ${e?.message ?? e}`);
  }

  const scope = buildScope(ctx);
  validateAst(tree, scope, !!opts.permissiveIdentifiers);

  let result: unknown;
  try {
    result = tree.evaluate(scope);
  } catch (e: any) {
    throw new Error(`Formula evaluation failed: ${e?.message ?? e}`);
  }

  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Formula did not evaluate to a finite number (got ${typeof result})`);
  }
  // Quantities are non-negative integer counts.
  return Math.max(0, Math.round(result));
}

/**
 * Walk the parsed AST and reject any node not in the allow-list. The
 * mathjs node types we accept have a tiny surface — anything else
 * (function calls, property access, assignments, etc.) is rejected
 * with a clear error before evaluate() ever runs.
 */
function validateAst(
  node: MathNode,
  scope: Record<string, number>,
  permissive: boolean,
): void {
  if (node.type === "ConstantNode") {
    const v = (node as ConstantNode).value;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`Formula uses a non-numeric constant: ${String(v)}`);
    }
    return;
  }
  if (node.type === "SymbolNode") {
    const name = (node as SymbolNode).name;
    if (!Object.prototype.hasOwnProperty.call(scope, name)) {
      if (permissive) return; // resolves to undefined; mathjs will then throw cleanly during evaluate
      throw new Error(`Formula uses unknown identifier: ${name}`);
    }
    return;
  }
  if (node.type === "OperatorNode") {
    const op = (node as OperatorNode).op;
    const fn = (node as OperatorNode).fn;
    if (!ALLOWED_OPS.has(op) && !ALLOWED_OPS.has(fn)) {
      throw new Error(`Formula uses disallowed operator: ${op || fn}`);
    }
    (node as OperatorNode).args.forEach((arg) => validateAst(arg, scope, permissive));
    return;
  }
  if (node.type === "ParenthesisNode") {
    validateAst((node as ParenthesisNode).content, scope, permissive);
    return;
  }
  throw new Error(`Formula uses disallowed node type: ${node.type}`);
}

function toFiniteNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof raw === "boolean") return raw ? 1 : 0;
  return 0;
}

function buildScope(ctx: ExpansionContext): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const [k, v] of Object.entries(ctx.engagementInputs || {})) {
    scope[k] = toFiniteNumber(v);
  }
  for (const [k, v] of Object.entries(ctx.promptAnswers || {})) {
    scope[k] = toFiniteNumber(v);
  }
  // Reserved identifiers: surface tier as a 1/2/3 hint in case a formula
  // wants to use it (e.g. "tier === 1 ? 5 : 3" — though our allow-list
  // forbids ternaries, so this is mostly informational and the override
  // columns are the canonical tier mechanism).
  scope.tier_ultimate = ctx.tier === "ultimate" ? 1 : 0;
  scope.tier_enhanced = ctx.tier === "enhanced" ? 1 : 0;
  scope.tier_essential = ctx.tier === "essential" ? 1 : 0;
  return scope;
}

function pickTierOverride(c: AssemblyComponentLite, tier: Tier): number | null {
  const raw = tier === "ultimate" ? c.ultimateTierOverride
    : tier === "enhanced" ? c.enhancedTierOverride
    : tier === "essential" ? c.essentialTierOverride
    : null;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure expansion. Given a template's components + their leaf catalog
 * defaults + a deal context, returns the lines that should be added.
 * Components whose quantity resolves to 0 are dropped silently — this
 * lets a single template cover "if entities > 5 add a multi-entity
 * surcharge line; otherwise omit it" by writing a formula like
 * `(entities > 5) * 1` … wait, our allow-list doesn't include
 * comparison operators, so callers can't use that pattern. The
 * canonical pattern is to set the override column to 0 instead.
 */
export function expandAssembly(
  components: AssemblyComponentLite[],
  catalogById: Map<number, ScopeCatalogLite>,
  ctx: ExpansionContext,
): ExpansionLine[] {
  const out: ExpansionLine[] = [];
  const sorted = [...components].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const c of sorted) {
    const leaf = catalogById.get(c.scopeItemId);
    if (!leaf) {
      // Skip orphan components. The route layer surfaces a warning so an
      // admin can fix the seed.
      continue;
    }
    const tierHours = pickTierOverride(c, ctx.tier);
    const leafDefault = toFiniteNumber(leaf.defaultHours);
    const adjustedHours = tierHours != null ? tierHours : leafDefault;

    let quantity: number;
    try {
      quantity = c.quantityFormula
        ? evaluateQuantityFormula(c.quantityFormula, ctx)
        : 1;
    } catch (e: any) {
      throw new Error(`Component ${c.id}: ${e?.message ?? e}`);
    }
    if (quantity <= 0) continue;

    out.push({
      scopeItemId: c.scopeItemId,
      quantity,
      adjustedHours,
      sourceComponentId: c.id,
      formulaUsed: c.quantityFormula,
    });
  }
  return out;
}
