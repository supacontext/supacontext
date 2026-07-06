import React from "react";

const steps = [
  {
    number: "1",
    title: "Search sources",
    description: (
      <p className="hiwCardText">
        SupaContext searches web, Reddit, X, YouTube, and more through one endpoint.
      </p>
    ),
  },
  {
    number: "2",
    title: "Clean & compress",
    description: (
      <p className="hiwCardText">
        Results are ranked, deduplicated, compressed, and compared across sources.
      </p>
    ),
  },
  {
    number: "3",
    title: "Return cited context",
    description: (
      <p className="hiwCardText">Your agent gets structured JSON with citations in every response.</p>
    ),
  },
];

export function HowItWorksSection() {
  return (
    <section className="hiwSection" aria-labelledby="how-it-works-title">
      <div className="hiwHeader">
        <h2 id="how-it-works-title">How Supacontext works</h2>
        <p>
          Supacontext searches the sources agents need, removes the noise, and returns compact cited
          context ready to use.
        </p>
      </div>
      <div className="hiwGrid">
        {steps.map((step) => (
          <div className="hiwCard" key={step.number}>
            <div className="hiwCardTop">
              <span className="hiwCardNumber">{step.number}</span>
              <span className="hiwCardStepLabel">Step</span>
            </div>
            <div className="hiwCardBottom">
              <h3 className="hiwCardTitle">{step.title}</h3>
              {step.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
