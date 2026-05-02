/**
 * F1.4 strangler-fig — DI container for the deal aggregate flow.
 *
 * Holds singletons for repository, event bus, and application
 * services. Subscribers are registered here so the wiring lives in
 * one place; route handlers just import the services they need.
 *
 * The container is built lazily on first access so importing this
 * module from a test file (or the route layer in a partial-server
 * boot) doesn't trigger DB calls.
 */
import { db } from "../db";
import {
  DrizzleDealRepository,
  InProcessEventBus,
  OutboxDispatcher,
} from "@dealpad/infrastructure";
import {
  ApproveDealService,
  RejectDealService,
  SubmitDealService,
} from "@dealpad/application";
import { IntappSubmissionGate } from "./gates/IntappSubmissionGate";
import { IntappApprovalGate } from "./gates/IntappApprovalGate";
import {
  NoOpWorkdayGate,
  WorkdaySubmissionGate,
} from "./gates/WorkdaySubmissionGate";
import { registerDealAutoPushSubscribers } from "./subscribers/dealAutoPush";

interface DealServicesContainer {
  bus: InProcessEventBus;
  repository: DrizzleDealRepository;
  outboxDispatcher: OutboxDispatcher;
  /** Used by /api/deals/:id/submit — Intapp gate only, no Workday. */
  submitDealServiceForSubmitEndpoint: SubmitDealService;
  /** Used by /api/deals/:dealId/approvals — Intapp + Workday gating. */
  submitDealServiceForApprovalsEndpoint: SubmitDealService;
  approveDealService: ApproveDealService;
  rejectDealService: RejectDealService;
}

let container: DealServicesContainer | null = null;

export function getDealServices(): DealServicesContainer {
  if (container) return container;

  const bus = new InProcessEventBus();
  const repository = new DrizzleDealRepository(db);
  const outboxDispatcher = new OutboxDispatcher(db, bus);

  const intappSubmission = new IntappSubmissionGate();
  const intappApproval = new IntappApprovalGate();
  const workday = new WorkdaySubmissionGate();
  const noopWorkday = new NoOpWorkdayGate();

  const submitForSubmit = new SubmitDealService(
    repository,
    bus,
    intappSubmission,
    noopWorkday,
  );
  const submitForApprovals = new SubmitDealService(
    repository,
    bus,
    intappSubmission,
    workday,
  );
  const approve = new ApproveDealService(repository, bus, intappApproval);
  const reject = new RejectDealService(repository, bus);

  registerDealAutoPushSubscribers(bus);

  container = {
    bus,
    repository,
    outboxDispatcher,
    submitDealServiceForSubmitEndpoint: submitForSubmit,
    submitDealServiceForApprovalsEndpoint: submitForApprovals,
    approveDealService: approve,
    rejectDealService: reject,
  };
  return container;
}

/**
 * Test hook: reset the container so the next call rebuilds with
 * fresh subscribers. Don't use in production code.
 */
export function __resetDealServicesForTesting(): void {
  container = null;
}
