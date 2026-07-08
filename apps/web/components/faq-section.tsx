import Link from "next/link";
import { homepageFaqs } from "../lib/faq-content";

export function FAQSection() {
  return (
    <section className="section faqSection" aria-labelledby="faq-title">
      <div className="faqShell">
        <div className="sectionHeader centeredHeader">
          <h2 id="faq-title">Frequently asked questions</h2>
          <p className="mutedText">
            Quick answers about context depth, integrations, credit usage, and keeping your agent
            prompts clean.
          </p>
        </div>

        <div className="faqGrid">
          {homepageFaqs.map((faq) => (
            <article className="faqItem" key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.shortAnswer ?? faq.answer}</p>
            </article>
          ))}
        </div>

        <div className="faqLinkWrap">
          <Link className="faqLink" href="/faq">
            View all FAQ
          </Link>
        </div>
      </div>
    </section>
  );
}
