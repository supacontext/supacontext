import { Check, X } from "lucide-react";

export function ComparisonSection() {
  return (
    <section className="section comparisonSection" aria-label="Supacontext vs Traditional Providers">
      <div className="comparisonSplit">
        <div className="comparisonCopy">
          <h2 className="comparisonHeading">The old way is broken</h2>
          <p className="mutedText">
            Agents need clean context from the sources people actually use, not separate APIs and noisy payloads.
          </p>
        </div>
        <div className="comparisonCardWrapper">
          <div className="comparisonCard">
            <div className="comparisonHalf rivalHalf">
              <span className="comparisonHalfEyebrow">Traditional APIs</span>
              <h3 className="comparisonHalfTitle">Firecrawl, Exa, etc</h3>
              <ul className="comparisonList rivalList">
                <li>
                  <X size={20} strokeWidth={2.5} />
                  <span>
                    <strong>Raw context payloads</strong>
                    Your agent still has to clean up large results.
                  </span>
                </li>
                <li>
                  <X size={20} strokeWidth={2.5} />
                  <span>
                    <strong>Separate integrations</strong>
                    Different tools for every source.
                  </span>
                </li>
                <li>
                  <X size={20} strokeWidth={2.5} />
                  <span>
                    <strong>More tokens, less signal</strong>
                    Source noise fills the context window.
                  </span>
                </li>
              </ul>
            </div>
            <div className="comparisonHalf solutionHalf">
              <span className="comparisonHalfEyebrow solutionEyebrow">Context API</span>
              <h3 className="comparisonHalfTitle solutionTitle">Supacontext</h3>
              <ul className="comparisonList solutionList">
                <li>
                  <Check size={20} strokeWidth={2.5} />
                  <span>
                    <strong>Compact cited context</strong>
                    Clean results your agent can use immediately.
                  </span>
                </li>
                <li>
                  <Check size={20} strokeWidth={2.5} />
                  <span>
                    <strong>One integration</strong>
                    Web, Reddit, X, YouTube, and more.
                  </span>
                </li>
                <li>
                  <Check size={20} strokeWidth={2.5} />
                  <span>
                    <strong>Built for agents</strong>
                    Structured JSON with citations in every response.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
