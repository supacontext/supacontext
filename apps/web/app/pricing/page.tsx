import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { DEPTH_CREDIT_COST, PLANS, PLAN_RATE_LIMITS } from "@supacontext/core";
import { SiteHeader } from "../../components/site-header";
import { formatCredits, formatMoney } from "../../lib/usage-formatting";

const planOrder = ["trial", "starter", "builder", "pro", "scale"] as const;

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">Pricing</p>
          <h1>Credits that match research depth.</h1>
          <p className="heroText">
            Start with 50 trial credits. Monthly plan credits refresh each billing period and unused
            monthly credits do not roll over.
          </p>
        </section>

        <section className="pricingGrid" aria-label="Plans">
          {planOrder.map((slug) => {
            const plan = PLANS[slug];
            const limits = PLAN_RATE_LIMITS[slug];

            return (
              <article className="card pricingCard" key={slug}>
                <div>
                  <p className="planName">{plan.name}</p>
                  <div className="priceLine">
                    <strong>{formatMoney(plan.priceCents)}</strong>
                    <span>{plan.billingInterval === "month" ? "/mo" : "one-time"}</span>
                  </div>
                  <p className="mutedText">{formatCredits(plan.includedCredits)}</p>
                </div>
                <div className="rows compactRows">
                  <div className="row">
                    <span>Requests</span>
                    <strong>{limits.requestsPerMinute}/min</strong>
                  </div>
                  <div className="row">
                    <span>Concurrent</span>
                    <strong>{limits.concurrentJobs}</strong>
                  </div>
                  <div className="row">
                    <span>Deep jobs</span>
                    <strong>{limits.deepConcurrentJobs}</strong>
                  </div>
                </div>
                <Link className="button fullButton primaryButton" href="/dashboard">
                  Choose {plan.name}
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
              </article>
            );
          })}
        </section>

        <section className="section twoColumn">
          <article className="card">
            <h2>Depth costs</h2>
            <div className="rows">
              {Object.entries(DEPTH_CREDIT_COST).map(([depth, credits]) => (
                <div className="row" key={depth}>
                  <span>{depth}</span>
                  <strong>{credits} credits</strong>
                </div>
              ))}
            </div>
          </article>
          <article className="card">
            <h2>Plan notes</h2>
            <ul className="checkList">
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Trial includes 50 one-time credits and does not allow Deep.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Paid plans include Deep with plan-specific concurrency limits.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Monthly credits do not roll over after renewal.
              </li>
            </ul>
          </article>
        </section>
      </main>
    </>
  );
}
