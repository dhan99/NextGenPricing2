/**
 * @dealpad/application — use-case orchestrators.
 *
 * Stitches together domain aggregates, repositories from
 * @dealpad/infrastructure, and the event bus. Thin layer; one
 * service per business workflow (submit, approve, reject, …).
 */
export * from "./ports/gates";
export {
  SubmitDealService,
  type SubmitDealInput,
  type SubmitDealResult,
} from "./services/SubmitDealService";
export {
  ApproveDealService,
  type ApproveDealInput,
  type ApproveDealResult,
} from "./services/ApproveDealService";
export {
  RejectDealService,
  type RejectDealInput,
  type RejectDealResult,
} from "./services/RejectDealService";
