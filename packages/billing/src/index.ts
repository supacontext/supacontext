import type { PlanSlug } from "@supacontext/core";

export type PaidPlanSlug = Exclude<PlanSlug, "trial">;

export type CheckoutSessionInput = {
  workspaceId: string;
  plan: PaidPlanSlug;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  provider: "creem";
  url: string;
  externalId: string;
};

export type BillingWebhookEvent = {
  source: "creem";
  externalId: string;
  eventType: string;
  payload: unknown;
};

export interface BillingClient {
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  parseWebhook(payload: string, signature: string): Promise<BillingWebhookEvent>;
}

export class BillingNotImplementedError extends Error {
  constructor() {
    super("Creem billing is a typed placeholder and has no API calls yet.");
    this.name = "BillingNotImplementedError";
  }
}

export class CreemBillingClient implements BillingClient {
  async createCheckoutSession(_input: CheckoutSessionInput): Promise<CheckoutSession> {
    throw new BillingNotImplementedError();
  }

  async parseWebhook(_payload: string, _signature: string): Promise<BillingWebhookEvent> {
    throw new BillingNotImplementedError();
  }
}

