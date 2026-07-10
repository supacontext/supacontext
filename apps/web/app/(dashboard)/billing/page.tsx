import { PLANS } from "@supacontext/core";
import { getPlanState, requireWorkspaceContext } from "../../../lib/server/dashboard";
import { formatCredits, formatDateTime, formatMoney } from "../../../lib/usage-formatting";
import { BillingActionButton, ManageBillingButton } from "./billing-actions";

const paidPlans = ["starter", "builder", "pro", "scale"] as const;

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
          <strong>{formatCredits(currentPlan.includedCredits)}</strong>
          <p>{formatMoney(currentPlan.priceCents)}</p>
        </article>
        <article className="metricCard">
          <span>Renewal date</span>
          <strong>{formatDateTime(currentPlan.renewalDate)}</strong>
          <p>Unused credits do not roll over</p>
        </article>
      </section>

      <section className="pricingGrid">
        {paidPlans.map((slug) => {
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
                <p className="mutedText">{formatCredits(plan.includedCredits)} per month</p>
              </div>
              <BillingActionButton
                label={
                  active
                    ? "Current plan"
                    : currentPlan.priceCents > plan.priceCents
                      ? "Downgrade"
                      : "Upgrade"
                }
                plan={slug}
              />
            </article>
          );
        })}
      </section>
    </main>
  );
}
