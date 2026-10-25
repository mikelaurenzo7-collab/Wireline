import { Link } from "react-router";

export default function LandingFooter() {
  return (
    <footer className="landing-prestige__footer">
      <nav aria-label="Footer">
        {[
          ["Product", "/features"],
          ["Pricing", "/pricing"],
          ["Support", "/support"],
          ["Privacy", "/privacy"],
          ["Terms", "/terms"],
        ].map(([label, to]) => (
          <Link key={to} to={to!}>
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("wireline:open-privacy-choices"))}
        >
          Privacy Choices
        </button>
      </nav>
    </footer>
  );
}
