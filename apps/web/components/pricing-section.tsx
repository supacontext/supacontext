"use client";

import React, { useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";

type Feature = {
  text: string;
  tooltip?: string;
};

type Plan = {
  slug: string;
  name: string;
  description: string;
  creditsLabel: string;
  monthlyPrice?: number;
  priceText?: string;
  periodText?: string;
  buttonText: string;
  buttonHref: string;
  isPopular?: boolean;
  features: Feature[];
};

const selfServePlans: Plan[] = [
  {
    slug: "free",
    name: "Free",
    description: "Test Supacontext in a prototype or side project.",
    creditsLabel: "250 credits / one-time",
    priceText: "$0",
    periodText: "one-time",
    buttonText: "Start Free",
    buttonHref: "/dashboard",
    features: [
      {
        text: "~25 runs one-time",
        tooltip: "Estimate based on 10 credits per run. Actual usage depends on query and effort level.",
      },
      {
        text: "1 concurrent request",
        tooltip: "The number of context requests that can run in parallel. Extra requests wait in queue.",
      },
      { text: "Lower rate limits", tooltip: "5 requests per minute." },
    ],
  },
  {
    slug: "starter",
    name: "Starter",
    description: "For people adding fresh context to their agents.",
    creditsLabel: "5,000 credits / month",
    monthlyPrice: 19,
    buttonText: "Choose Starter",
    buttonHref: "/dashboard",
    isPopular: true,
    features: [
      {
        text: "~500 runs / month",
        tooltip: "Estimate based on 10 credits per run. Actual usage depends on query and effort level.",
      },
      {
        text: "3 concurrent requests",
        tooltip: "The number of context requests that can run in parallel. Extra requests wait in queue.",
      },
      { text: "Basic support" },
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    description: "For apps that call Supacontext every day.",
    creditsLabel: "25,000 credits / month",
    monthlyPrice: 79,
    buttonText: "Choose Pro",
    buttonHref: "/dashboard",
    features: [
      {
        text: "~2,500 runs / month",
        tooltip: "Estimate based on 10 credits per run. Actual usage depends on query and effort level.",
      },
      {
        text: "10 concurrent requests",
        tooltip: "The number of context requests that can run in parallel. Extra requests wait in queue.",
      },
      { text: "Standard support" },
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    description: "For high-volume apps with heavier parallel work.",
    creditsLabel: "75,000 credits / month",
    monthlyPrice: 199,
    buttonText: "Choose Growth",
    buttonHref: "/dashboard",
    features: [
      {
        text: "~7,500 runs / month",
        tooltip: "Estimate based on 10 credits per run. Actual usage depends on query and effort level.",
      },
      {
        text: "25 concurrent requests",
        tooltip: "The number of context requests that can run in parallel. Extra requests wait in queue.",
      },
      { text: "Priority support" },
    ],
  },
];

const scalePlans: Plan[] = [
  {
    slug: "scale",
    name: "Scale",
    description: "For larger pipelines that need more credits and throughput.",
    creditsLabel: "200,000 credits / month",
    monthlyPrice: 499,
    buttonText: "Choose Scale",
    buttonHref: "/dashboard",
    features: [
      {
        text: "~20,000 runs / month",
        tooltip: "Estimate based on 10 credits per run. Actual usage depends on query and effort level.",
      },
      {
        text: "75 concurrent requests",
        tooltip: "The number of context requests that can run in parallel. Extra requests wait in queue.",
      },
      { text: "Priority support" },
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "For teams that need custom limits, contracts, or support.",
    creditsLabel: "Custom credits",
    priceText: "Custom",
    buttonText: "Contact Sales",
    buttonHref: "mailto:sales@supacontext.com",
    features: [
      { text: "Custom run volume", tooltip: "Credits and estimated run volume are scoped with your team." },
      {
        text: "Custom concurrency",
        tooltip: "The number of context requests that can run in parallel. Extra requests wait in queue.",
      },
      { text: "Dedicated support and SLA" },
    ],
  },
];

function getDisplayedMonthlyPrice(monthlyPrice: number, annualBilling: boolean) {
  if (!annualBilling) {
    return monthlyPrice;
  }

  return Math.round((monthlyPrice * 10) / 12);
}

export function PricingSection() {
  const [activeTab, setActiveTab] = useState<"self-serve" | "scale">("self-serve");
  const [annualBilling, setAnnualBilling] = useState(true);

  const plansToShow = activeTab === "self-serve" ? selfServePlans : scalePlans;

  return (
    <section className="section pricingSection" aria-labelledby="pricing-title">
      <div className="sectionHeader centeredHeader pricingIntro">
        <h2 id="pricing-title">Flexible pricing, based on usage</h2>
        <p className="mutedText">
          Start free, then upgrade when your agents need more capacity.
        </p>
      </div>

      <div className="pricingTabsWrapper">
        <div className="pricingTabs" role="tablist" aria-label="Pricing plan type">
          <button
            className={`pricingTabButton ${activeTab === "self-serve" ? "active" : ""}`}
            onClick={() => setActiveTab("self-serve")}
            role="tab"
            aria-selected={activeTab === "self-serve"}
            type="button"
          >
            Standard plans
          </button>
          <button
            className={`pricingTabButton ${activeTab === "scale" ? "active" : ""}`}
            onClick={() => setActiveTab("scale")}
            role="tab"
            aria-selected={activeTab === "scale"}
            type="button"
          >
            Scale plans
          </button>
        </div>
      </div>

      <div className="pricingGridWrapper">
        <div className={`pricingGrid newPricingGrid ${activeTab === "scale" ? "scalePricingGrid" : ""}`}>
          {plansToShow.map((plan) => {
            const isPopular = plan.isPopular;
            const hasAnnualToggle = plan.monthlyPrice !== undefined;
            const annualSavings = hasAnnualToggle ? plan.monthlyPrice! * 2 : 0;
            const priceText = hasAnnualToggle
              ? `$${getDisplayedMonthlyPrice(plan.monthlyPrice!, annualBilling)}`
              : plan.priceText;
            const periodText = hasAnnualToggle ? "/mo" : plan.periodText;

            return (
              <article
                key={plan.slug}
                className={`pricingCard scPricingCard ${hasAnnualToggle ? "pricingCardAnnual" : ""} ${
                  isPopular ? "pricingCardPopular" : ""
                }`}
              >
                {isPopular && <div className="popularBadge">Recommended</div>}

                <div className="pricingCardHeader">
                  <h3 className="planName">{plan.name}</h3>
                  <p className="planDescription">{plan.description}</p>
                  <div className="planCreditsLine">
                    <strong>{plan.creditsLabel}</strong>
                  </div>
                  <div className="planCreditsDivider" />
                  <div className="planPriceWrapper">
                    <span className="planPrice">{priceText}</span>
                    {periodText && <span className="planPeriod">{periodText}</span>}
                  </div>
                  {hasAnnualToggle ? (
                    <label className="annualBillingToggle">
                      <input
                        checked={annualBilling}
                        onChange={(event) => setAnnualBilling(event.target.checked)}
                        type="checkbox"
                        aria-label={`Bill ${plan.name} yearly`}
                      />
                      <span className="annualToggleTrack" aria-hidden="true">
                        <span className="annualToggleThumb" />
                      </span>
                      <span>{annualBilling ? "Billed yearly" : "Monthly"}</span>
                      <strong>Save ${annualSavings}</strong>
                    </label>
                  ) : (
                    <div className="annualBillingToggle annualBillingTogglePlaceholder" aria-hidden="true" />
                  )}
                </div>

                <div className="pricingCardAction">
                  <Link
                    href={plan.buttonHref}
                    className={`button fullButton ${isPopular ? "primaryButton" : "secondaryButton"}`}
                  >
                    {plan.buttonText}
                  </Link>
                </div>

                <div className="pricingCardDivider" />

                <div className="pricingCardBody">
                  <ul className="planFeatureList">
                    {plan.features.map((feature) => (
                      <li key={feature.text} className="planFeature">
                        <div className="planFeatureIcon">
                          <Check size={15} strokeWidth={3} />
                        </div>
                        {feature.tooltip ? (
                          <span className="planFeatureTooltip" tabIndex={0}>
                            {feature.text}
                            <span className="planFeatureTooltipText" role="tooltip">
                              {feature.tooltip}
                            </span>
                          </span>
                        ) : (
                          <span>{feature.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
