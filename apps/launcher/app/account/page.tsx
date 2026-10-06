import { MembershipWorkspace } from "../../src/membership/workspace";
export default function AccountPage() {
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
        <a className="account-link" href="/">
          Applications
        </a>
      </header>
      <main id="main" className="workspace-main">
        <MembershipWorkspace />
      </main>
    </div>
  );
}
