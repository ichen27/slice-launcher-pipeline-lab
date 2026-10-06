import { AccountNav } from "../src/membership/account-nav";
import { AppTile } from "@slice/ui";
import { apps, getPublicAppUrl } from "../src/lib/apps";

function GridIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Slice Consulting home">
          <img
            src="/brand/slice-logo.png"
            alt="Slice Consulting — Syracuse University"
            width="180"
            height="100"
          />
        </a>
        <div className="header-divider" aria-hidden="true" />
        <span className="workspace-label">App Launcher</span>
        <AccountNav />
      </header>
      <main id="main" className="workspace-main">
        <section aria-labelledby="applications-title">
          <h1 id="applications-title">Applications</h1>
          {apps.length === 0 ? (
            <div className="empty-catalog">
              <span className="empty-icon">
                <GridIcon />
              </span>
              <h2>No apps have been added yet</h2>
            </div>
          ) : (
            <div className="app-grid">
              {apps.map((app) => (
                <AppTile
                  key={app.id}
                  name={app.name}
                  description={app.description}
                  href={getPublicAppUrl(app)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="site-footer">
        <span>Slice Consulting</span>
        <nav className="project-links" aria-label="Project resources">
          <a
            href="https://github.com/ichen27/slice-launcher/blob/main/docs/adding-an-app.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contributor guide<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a
            href="https://github.com/ichen27/slice-launcher"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
      </footer>
    </div>
  );
}
