import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { DEPTH_CREDIT_COST, PLANS, PLAN_RATE_LIMITS, PLAN_SLUGS } from "@supacontext/core";
import { SiteHeader } from "../../components/site-header";
import { formatCredits, formatMoney } from "../../lib/usage-formatting";

function formatAnnualMonthlyPrice(annualPriceCents: number): string {
  return formatMoney(Math.round(annualPriceCents / 1200) * 100);
}

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">Pricing</p>
          <h1>Credits that match research depth.</h1>
          <p className="heroText">
            Start with 250 free credits. Paid plans include monthly credit allowances, and annual
            billing saves the cost of two months.
          </p>
        </section>

        <section className="pricingGrid" aria-label="Plans">
          {PLAN_SLUGS.map((slug) => {
            const plan = PLANS[slug];
            const limits = PLAN_RATE_LIMITS[slug];
            const isEnterprise = slug === "enterprise";

            return (
              <article className="card pricingCard" key={slug}>
                <div>
                  <p className="planName">{plan.name}</p>
                  <div className="priceLine">
                    <strong>
                      {plan.priceCents === null ? "Custom" : formatMoney(plan.priceCents)}
                    </strong>
                    <span>
                      {plan.billingInterval === "month"
                        ? "/mo"
                        : plan.billingInterval === "one_time"
                          ? "one-time"
                          : null}
                    </span>
                  </div>
                  {plan.annualPriceCents !== null ? (
                    <p className="mutedText">
                      {formatAnnualMonthlyPrice(plan.annualPriceCents)}/mo billed yearly (
                      {formatMoney(plan.annualPriceCents)}/year)
                    </p>
                  ) : null}
                  <p className="mutedText">
                    {plan.includedCredits === null
                      ? "Custom credits"
                      : formatCredits(plan.includedCredits)}
                  </p>
                </div>
                <div className="rows compactRows">
                  <div className="row">
                    <span>Requests</span>
                    <strong>
                      {limits.requestsPerMinute === null
                        ? "Custom"
                        : `${limits.requestsPerMinute}/min`}
                    </strong>
                  </div>
                  <div className="row">
                    <span>Concurrent</span>
                    <strong>
                      {limits.concurrentJobs === null ? "Custom" : limits.concurrentJobs}
                    </strong>
                  </div>
                  <div className="row">
                    <span>Deep</span>
                    <strong>{plan.deepAllowed ? "Included" : "Not included"}</strong>
                  </div>
                </div>
                <Link
                  className="button fullButton primaryButton"
                  href={isEnterprise ? "mailto:sales@supacontext.com" : "/dashboard"}
                >
                  {isEnterprise ? "Contact Sales" : `Choose ${plan.name}`}
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
                Free includes 250 one-time credits and does not allow Deep.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Paid plans include Deep with plan-specific concurrency limits.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Annual billing costs the same as ten monthly payments.
              </li>
            </ul>
          </article>
        </section>
      </main>
    </>
  );
}
