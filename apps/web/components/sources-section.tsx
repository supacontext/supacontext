import Image from "next/image";

const sources = [
  { name: "Web", icon: "/source-logos/web.svg" },
  { name: "Reddit", icon: "/source-logos/reddit.svg" },
  { name: "X / Twitter", icon: "/source-logos/x.svg" },
  { name: "LinkedIn", icon: "/source-logos/linkedin.svg" },
  { name: "Google Maps", icon: "/source-logos/maps.svg" },
  { name: "News", icon: "/source-logos/news.svg" },
  { name: "Hacker News", icon: "/source-logos/hacker-news.svg" },
  { name: "Product Hunt", icon: "/source-logos/product-hunt.svg", comingSoon: true },
  { name: "YouTube", icon: "/source-logos/youtube.svg" },
  { name: "Forums", icon: "/source-logos/forums.svg" },
  { name: "Facebook", icon: "/source-logos/facebook.svg" },
  { name: "GitHub", icon: "/source-logos/github.svg" },
  { name: "Instagram", icon: "/source-logos/instagram.svg", comingSoon: true },
  { name: "TikTok", icon: "/source-logos/tiktok.svg", comingSoon: true },
  { name: "Request Source", icon: "/source-logos/request.svg", isRequest: true },
];

export function SourcesSection() {
  return (
    <section className="section scSourcesSection" aria-labelledby="sources-title">
      <div className="sectionHeader centeredHeader">
        <h2 id="sources-title">11 platforms. One clean response.</h2>
        <p className="mutedText scSourcesSub">
          Send one query. Supacontext gathers the evidence, cuts the noise, and returns compact JSON
          your agent can cite.
        </p>
      </div>

      <div className="scSourcesGrid">
        {sources.map((source) => {
          const cardClassName = `scSourceCard${source.comingSoon ? " scSourceCardComingSoon" : ""}${source.isRequest ? " scSourceCardRequest" : ""}`;

          if (source.isRequest) {
            return (
              <a
                href="mailto:support@supacontext.com?subject=New Source Request"
                className={cardClassName}
                key={source.name}
              >
                <span className="scSourceCardIconFrame" aria-hidden="true">
                  <Image
                    className="scSourceCardIcon"
                    src={source.icon}
                    alt=""
                    width={24}
                    height={24}
                  />
                </span>
                <span className="scSourceCardTitle">{source.name}</span>
                <span className="scRequestTooltip">Suggest a new platform</span>
              </a>
            );
          }

          return (
            <div className={cardClassName} key={source.name}>
              <span className="scSourceCardIconFrame" aria-hidden="true">
                <Image
                  className="scSourceCardIcon"
                  src={source.icon}
                  alt=""
                  width={24}
                  height={24}
                />
              </span>
              <span className="scSourceCardTitle">{source.name}</span>
              {source.comingSoon ? <span className="scComingSoonTooltip">Coming Soon</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
