/**
 * @dealpad/domain — pure domain model for DealPad.
 *
 * Strangler-fig refactor target (F1.4). Holds value objects, aggregates,
 * and domain events. **No I/O, no Drizzle, no Express, no React** — only
 * TypeScript and pure logic. Anything that needs the database goes in
 * @dealpad/infrastructure; anything that orchestrates a use case goes in
 * @dealpad/application.
 */
export * from "./shared";
