import React from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { PLANS, PLAN_RATE_LIMITS } from "@supacontext/core";
import { formatCredits, formatMoney } from "../lib/usage-formatting";

const gridPlans = ["starter", "builder", "pro"] as const;

export function PricingSection() {
  const scalePlan = PLANS.scale;
  const scaleLimits = PLAN_RATE_LIMITS.scale;

  return (
    <section className="section pricingSection" aria-labelledby="pricing-title">
      <div className="sectionHeader centeredHeader">
        <h2 id="pricing-title">Simple, transparent pricing</h2>
        <p className="mutedText">
          Every new account includes 50 free trial credits. Upgrade when you need more power.
        </p>
      </div>

      <div className="pricingGridWrapper">
        <div className="pricingGrid">
          {gridPlans.map((slug) => {
            const plan = PLANS[slug];
            const limits = PLAN_RATE_LIMITS[slug];
            const isPopular = slug === "builder";

            return (
              <div
                key={slug}
                className={`pricingCard ${isPopular ? "pricingCardPopular" : ""}`}
              >
                {isPopular && (
                  <div className="popularBadge">Most Popular</div>
                )}
                <div className="pricingCardHeader">
                  <h3 className="planName">{plan.name}</h3>
                  <p className="planDescription">
                    {slug === "starter" && "For early-stage projects and individuals."}
                    {slug === "builder" && "For teams building production agents."}
                    {slug === "pro" && "For high-volume production applications."}
                  </p>
                  <div className="planPriceWrapper">
                    <span className="planPrice">{formatMoney(plan.priceCents)}</span>
                    <span className="planPeriod">
                      {plan.billingInterval === "month" ? "/mo" : " one-time"}
                    </span>
                  </div>
                </div>

                <div className="pricingCardBody">
                  <ul className="planFeatureList">
                    <li className="planFeature">
                      <div className="planFeatureIcon">
                        <Check size={16} strokeWidth={3} />
                      </div>
                      <span>
                        <strong>{formatCredits(plan.includedCredits)}</strong>
                        {plan.billingInterval === "month" ? " / month" : ""}
                      </span>
                    </li>
                    <li className="planFeature">
                      <div className="planFeatureIcon">
                        <Check size={16} strokeWidth={3} />
                      </div>
                      <span>
                        <strong>{limits.requestsPerMinute}</strong> requests / min
                      </span>
                    </li>
                    <li className="planFeature">
                      <div className="planFeatureIcon">
                        <Check size={16} strokeWidth={3} />
                      </div>
                      <span>
                        <strong>{limits.concurrentJobs}</strong> concurrent jobs
                      </span>
                    </li>
                    <li className="planFeature">
                      <div className="planFeatureIcon">
                        <Check size={16} strokeWidth={3} />
                      </div>
                      <span>Access to all 12+ data sources</span>
                    </li>
                  </ul>
                </div>

                <div className="pricingCardFooter">
                  <Link
                    href="/dashboard"
                    className={`button fullButton ${
                      isPopular ? "primaryButton" : "secondaryButton"
                    }`}
                  >
                    Choose {plan.name}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Scale / Enterprise Card */}
        <div className="pricingScaleCard">
          <div className="scaleCardContent">
            <h3 className="planName">{scalePlan.name}</h3>
            <p className="planDescription" style={{ marginBottom: "16px", minHeight: "auto" }}>
              For large scale usage and massive context volume.
            </p>
            <div className="planPriceWrapper">
              <span className="planPrice">{formatMoney(scalePlan.priceCents)}</span>
              <span className="planPeriod">
                {scalePlan.billingInterval === "month" ? "/mo" : " one-time"}
              </span>
            </div>
          </div>

          <div className="scaleCardFeatures">
            <ul className="planFeatureList">
              <li className="planFeature">
                <div className="planFeatureIcon">
                  <Check size={16} strokeWidth={3} />
                </div>
                <span>
                  <strong>{formatCredits(scalePlan.includedCredits)}</strong> / month
                </span>
              </li>
              <li className="planFeature">
                <div className="planFeatureIcon">
                  <Check size={16} strokeWidth={3} />
                </div>
                <span>
                  <strong>{scaleLimits.requestsPerMinute}</strong> requests / min
                </span>
              </li>
            </ul>
            <ul className="planFeatureList">
              <li className="planFeature">
                <div className="planFeatureIcon">
                  <Check size={16} strokeWidth={3} />
                </div>
                <span>
                  <strong>{scaleLimits.concurrentJobs}</strong> concurrent jobs
                </span>
              </li>
              <li className="planFeature">
                <div className="planFeatureIcon">
                  <Check size={16} strokeWidth={3} />
                </div>
                <span>Access to all 12+ data sources</span>
              </li>
            </ul>
            <div>
              <Link
                href="/dashboard"
                className="button secondaryButton fullButton"
                style={{ marginTop: "12px" }}
              >
                Choose {scalePlan.name}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
