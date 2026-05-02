/**
 * F1.2 — AssemblyExpansionService unit tests.
 *
 * Pure-function tests, no DB. Two halves:
 *   - happy-path expansion: tier overrides + quantity formulas resolve
 *     to the expected lines.
 *   - sandbox: every malicious input I can think of (function calls,
 *     property access, prototype walks, mathjs gadgets) is rejected
 *     by the AST validator BEFORE evaluate() runs.
 *
 * The sandbox tests are the high-stakes ones — they're the safety
 * net documented in BACKLOG.md F1.2's done-when ("Formula evaluator
 * rejects anything that isn't pure arithmetic on the allowed
 * identifiers").
 */

import { describe, it, expect } from "vitest";
import {
  evaluateQuantityFormula,
  expandAssembly,
  type ExpansionContext,
  type AssemblyComponentLite,
  type ScopeCatalogLite,
} from "../../server/services/AssemblyExpansionService";

const ctx = (overrides: Partial<ExpansionContext> = {}): ExpansionContext => ({
  tier: "ultimate",
  engagementInputs: { entities: 3, countries: 2, tpTransactions: 10 },
  promptAnswers: { prompt_1: 1.2 },
  ...overrides,
});

describe("evaluateQuantityFormula — happy path", () => {
  it("resolves a literal", () => {
    expect(evaluateQuantityFormula("5", ctx())).toBe(5);
  });

  it("resolves an identifier from engagementInputs", () => {
    expect(evaluateQuantityFormula("entities", ctx())).toBe(3);
  });

  it("does basic arithmetic", () => {
    expect(evaluateQuantityFormula("entities * 2 + 1", ctx())).toBe(7);
  });

  it("respects parentheses and precedence", () => {
    expect(evaluateQuantityFormula("(entities + countries) * 2", ctx())).toBe(10);
  });

  it("supports unary minus and clamps negatives to 0", () => {
    expect(evaluateQuantityFormula("-entities", ctx())).toBe(0);
  });

  it("rounds non-integer results", () => {
    // 10 / 3 = 3.333… → 3
    expect(evaluateQuantityFormula("tpTransactions / 3", ctx())).toBe(3);
  });

  it("resolves prompt identifiers", () => {
    // 1.2 → 1
    expect(evaluateQuantityFormula("prompt_1", ctx())).toBe(1);
    expect(evaluateQuantityFormula("prompt_1 * 5", ctx())).toBe(6); // 1.2*5=6.0 → 6
  });

  it("treats empty / whitespace formula as quantity=1", () => {
    expect(evaluateQuantityFormula("", ctx())).toBe(1);
    expect(evaluateQuantityFormula("   ", ctx())).toBe(1);
  });

  it("coerces non-numeric engagementInputs to 0", () => {
    const c = ctx({ engagementInputs: { entities: "not-a-number" } });
    expect(evaluateQuantityFormula("entities + 7", c)).toBe(7);
  });
});

describe("evaluateQuantityFormula — sandbox rejects malicious / disallowed input", () => {
  it("rejects unknown identifiers (catches typos)", () => {
    expect(() => evaluateQuantityFormula("entites + 1", ctx())).toThrow(/unknown identifier/i);
  });

  it("rejects function calls — basic", () => {
    expect(() => evaluateQuantityFormula("sqrt(entities)", ctx())).toThrow(/disallowed node type/i);
  });

  it("rejects function calls — mathjs builtins (even though they're disabled)", () => {
    expect(() => evaluateQuantityFormula("evaluate('1+1')", ctx())).toThrow(/disallowed node type/i);
    expect(() => evaluateQuantityFormula("import('foo', { foo: 1 })", ctx())).toThrow(/disallowed node type/i);
    expect(() => evaluateQuantityFormula("createUnit('foo')", ctx())).toThrow(/disallowed node type/i);
    expect(() => evaluateQuantityFormula("parse('1+1')", ctx())).toThrow(/disallowed node type/i);
  });

  it("rejects accessor / index expressions", () => {
    // Note: `x.y` parses as an OperatorNode for matrix dot in mathjs but
    // we still expect the validator to reject anything unfamiliar. Test
    // via index notation which is unambiguously AccessorNode.
    expect(() => evaluateQuantityFormula("entities[0]", ctx())).toThrow();
  });

  it("rejects assignment", () => {
    expect(() => evaluateQuantityFormula("entities = 5", ctx())).toThrow();
  });

  it("rejects function definition", () => {
    expect(() => evaluateQuantityFormula("f(x) = x + 1", ctx())).toThrow();
  });

  it("rejects ranges", () => {
    expect(() => evaluateQuantityFormula("1:5", ctx())).toThrow();
  });

  it("rejects conditional / ternary", () => {
    // mathjs syntax: `condition ? a : b`
    expect(() => evaluateQuantityFormula("entities > 0 ? 5 : 0", ctx())).toThrow();
  });

  it("rejects block / multiple statements", () => {
    expect(() => evaluateQuantityFormula("entities; 1+1", ctx())).toThrow();
  });

  it("rejects matrix / array literals", () => {
    expect(() => evaluateQuantityFormula("[1, 2, 3]", ctx())).toThrow();
  });

  it("rejects object / record literals", () => {
    expect(() => evaluateQuantityFormula('{a: 1}', ctx())).toThrow();
  });

  it("rejects attempts to escape via property access", () => {
    expect(() => evaluateQuantityFormula("entities.constructor", ctx())).toThrow();
  });

  it("rejects garbage parse input", () => {
    expect(() => evaluateQuantityFormula("(((", ctx())).toThrow(/parse error/i);
  });

  it("rejects non-finite numeric outcomes", () => {
    // 0^0 is finite (=1) in mathjs; 1/0 → Infinity.
    expect(() => evaluateQuantityFormula("1 / 0", ctx())).toThrow(/finite/i);
  });
});

describe("expandAssembly", () => {
  const catalog: ScopeCatalogLite[] = [
    { id: 100, defaultHours: "8" },
    { id: 200, defaultHours: "16" },
    { id: 300, defaultHours: "4" },
  ];
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const components: AssemblyComponentLite[] = [
    // Federal: tier overrides applied; one per entity
    {
      id: 1,
      scopeItemId: 100,
      ultimateTierOverride: "12.5",
      enhancedTierOverride: "10",
      essentialTierOverride: "8",
      quantityFormula: "entities",
      sortOrder: 1,
    },
    // State: no override, formula is countries
    {
      id: 2,
      scopeItemId: 200,
      ultimateTierOverride: null,
      enhancedTierOverride: null,
      essentialTierOverride: null,
      quantityFormula: "countries",
      sortOrder: 2,
    },
    // PMO: 1 line, no formula
    {
      id: 3,
      scopeItemId: 300,
      ultimateTierOverride: "6",
      enhancedTierOverride: null,
      essentialTierOverride: null,
      quantityFormula: null,
      sortOrder: 3,
    },
  ];

  it("expands a 3-component template (Ultimate tier)", () => {
    const lines = expandAssembly(components, catalogById, ctx({ tier: "ultimate" }));
    expect(lines.length).toBe(3);

    expect(lines[0]).toEqual({
      scopeItemId: 100, quantity: 3, adjustedHours: 12.5, sourceComponentId: 1, formulaUsed: "entities",
    });
    expect(lines[1]).toEqual({
      scopeItemId: 200, quantity: 2, adjustedHours: 16, sourceComponentId: 2, formulaUsed: "countries",
    });
    expect(lines[2]).toEqual({
      scopeItemId: 300, quantity: 1, adjustedHours: 6, sourceComponentId: 3, formulaUsed: null,
    });
  });

  it("falls back to leaf default when the tier override is null", () => {
    const lines = expandAssembly(components, catalogById, ctx({ tier: "enhanced" }));
    // Component 3: no enhanced override → leaf default = 4
    const pmo = lines.find((l) => l.sourceComponentId === 3);
    expect(pmo?.adjustedHours).toBe(4);
  });

  it("drops components whose quantity resolves to 0", () => {
    const c2 = ctx({ tier: "ultimate", engagementInputs: { entities: 0, countries: 2 } });
    const lines = expandAssembly(components, catalogById, c2);
    expect(lines.find((l) => l.sourceComponentId === 1)).toBeUndefined();
    expect(lines.find((l) => l.sourceComponentId === 2)).toBeDefined();
  });

  it("skips components whose leaf is missing from the catalog map", () => {
    const orphan: AssemblyComponentLite = {
      id: 999, scopeItemId: 9999,
      ultimateTierOverride: null, enhancedTierOverride: null, essentialTierOverride: null,
      quantityFormula: null, sortOrder: 0,
    };
    const lines = expandAssembly([orphan, ...components], catalogById, ctx());
    expect(lines.length).toBe(3); // orphan dropped
    expect(lines.find((l) => l.sourceComponentId === 999)).toBeUndefined();
  });

  it("respects sortOrder", () => {
    const reordered: AssemblyComponentLite[] = components.map((c) => ({
      ...c, sortOrder: 100 - (c.sortOrder ?? 0),
    }));
    const lines = expandAssembly(reordered, catalogById, ctx());
    expect(lines.map((l) => l.sourceComponentId)).toEqual([3, 2, 1]);
  });

  it("propagates a malicious formula error with component context", () => {
    const bad: AssemblyComponentLite = {
      id: 42, scopeItemId: 100,
      ultimateTierOverride: null, enhancedTierOverride: null, essentialTierOverride: null,
      quantityFormula: "evaluate('1+1')", sortOrder: 0,
    };
    expect(() => expandAssembly([bad], catalogById, ctx())).toThrow(/Component 42:/);
  });
});
