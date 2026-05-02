export { Deal, type DealRow, type DealSnapshot } from "./Deal";
export {
  DealStatus,
  DEAL_STATUSES,
  type DealStatusValue,
} from "./DealStatus";
export { dealId, type DealId } from "./DealId";
export {
  type DomainEvent,
  type DealEvent,
  type DealSubmittedEventV1,
  type DealApprovedEventV1,
  type DealRejectedEventV1,
  dealSubmitted,
  dealApproved,
  dealRejected,
} from "./events";
