import { CheckCircle2 } from "lucide-react";
import { CONTEXT_EFFORTS, EFFORT_PROFILES } from "@supacontext/core";
import { PricingSection } from "../../components/pricing-section";
import { SiteHeader } from "../../components/site-header";
import { formatEffort } from "../../lib/usage-formatting";

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pageHero">
          <p className="eyebrow">Pricing</p>
          <h1>Pay for the research your request actually uses.</h1>
          <p className="heroText">
            Credits cover provider operations, model input and output tokens, and Auto routing.
            Effort controls the research profile and safety cap. Actual usage determines the charge.
          </p>
        </section>

        <PricingSection />

        <section className="section twoColumn">
          <article className="card">
            <h2>Effort caps</h2>
            <p className="mutedText">
              Actual charges vary with work performed. Pass <code>max_credits</code> to set a lower
              cap for one request.
            </p>
            <div className="rows">
              {CONTEXT_EFFORTS.map((effort) => (
                <div className="row" key={effort}>
                  <span>{formatEffort(effort)}</span>
                  <strong>{EFFORT_PROFILES[effort].maximumCredits.toString()} credits max</strong>
                </div>
              ))}
            </div>
          </article>
          <article className="card">
            <h2>How charging works</h2>
            <ul className="checkList">
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Supacontext reserves credits before paid work begins.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                The pricing registry charges provider calls and reported model tokens.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Settlement releases the unused reservation.
              </li>
              <li>
                <CheckCircle2 aria-hidden="true" size={18} />
                Monthly plan credits expire at renewal.
              </li>
            </ul>
          </article>
        </section>
      </main>
    </>
  );
}
