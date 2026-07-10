import { PLANS, SELF_SERVE_PAID_PLAN_SLUGS } from "@supacontext/core";
import { getPlanState, requireWorkspaceContext } from "../../../lib/server/dashboard";
import {
  formatAnnualMonthlyPrice,
  formatCredits,
  formatDateTime,
  formatMoney,
} from "../../../lib/usage-formatting";
import { BillingActionButton, ManageBillingButton } from "./billing-actions";

function formatCurrentPrice(
  monthlyPriceCents: number | null,
  annualPriceCents: number | null,
  billingInterval: "month" | "year" | null,
): string {
  if (monthlyPriceCents === null) {
    return "Custom";
  }

  if (billingInterval === "year" && annualPriceCents !== null) {
    return `${formatMoney(annualPriceCents)}/year`;
  }

  return monthlyPriceCents === 0 ? "$0" : `${formatMoney(monthlyPriceCents)}/month`;
}

export default async function BillingPage() {
  const workspace = await requireWorkspaceContext();
  const currentPlan = await getPlanState(workspace.workspaceId);

  return (
    <main className="dashboardPage">
      <section className="dashboardHero">
        <div>
          <p className="eyebrow">Billing</p>
          <h1>Plan and credit state</h1>
          <p className="mutedText">
            Upgrade, change plans, open the customer portal, and track subscription credit renewals.
          </p>
        </div>
        <ManageBillingButton />
      </section>

      <section className="metricGrid">
        <article className="metricCard">
          <span>Current plan</span>
          <strong>{currentPlan.name}</strong>
          <p>
            {currentPlan.status}
            {currentPlan.cancelAtPeriodEnd ? " - cancels at period end" : ""}
          </p>
        </article>
        <article className="metricCard">
          <span>Credits per month</span>
          <strong>
            {currentPlan.includedCredits === null
              ? "Custom"
              : formatCredits(currentPlan.includedCredits)}
          </strong>
          <p>
            {formatCurrentPrice(
              currentPlan.priceCents,
              currentPlan.annualPriceCents,
              currentPlan.billingInterval,
            )}
          </p>
        </article>
        <article className="metricCard">
          <span>Renewal date</span>
          <strong>{formatDateTime(currentPlan.renewalDate)}</strong>
          <p>Unused credits do not roll over</p>
        </article>
      </section>

      <section className="pricingGrid">
        {SELF_SERVE_PAID_PLAN_SLUGS.map((slug) => {
          const plan = PLANS[slug];
          const active = currentPlan.slug === slug;

          return (
            <article className="card pricingCard" key={slug}>
              <div>
                <p className="planName">{plan.name}</p>
                <div className="priceLine">
                  <strong>{formatMoney(plan.priceCents)}</strong>
                  <span>/mo</span>
                </div>
                <p className="mutedText">
                  {formatAnnualMonthlyPrice(plan.annualPriceCents)}/mo billed yearly (
                  {formatMoney(plan.annualPriceCents)}/year)
                </p>
                <p className="mutedText">{formatCredits(plan.includedCredits)} per month</p>
              </div>
              <BillingActionButton
                billingInterval="month"
                disabled={active && currentPlan.billingInterval === "month"}
                label={
                  active && currentPlan.billingInterval === "month" ? "Current plan" : "Monthly"
                }
                plan={slug}
              />
              <BillingActionButton
                billingInterval="year"
                disabled={active && currentPlan.billingInterval === "year"}
                label={active && currentPlan.billingInterval === "year" ? "Current plan" : "Annual"}
                plan={slug}
              />
            </article>
          );
        })}
        <article className="card pricingCard">
          <div>
            <p className="planName">{PLANS.enterprise.name}</p>
            <div className="priceLine">
              <strong>Custom</strong>
            </div>
            <p className="mutedText">Custom credits and concurrency</p>
          </div>
          <a className="button primaryButton fullButton" href="mailto:sales@supacontext.com">
            Contact Sales
          </a>
        </article>
      </section>
    </main>
  );
}
