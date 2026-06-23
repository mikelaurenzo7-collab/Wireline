// New viral launch banner with Grok-powered demo CTA + fleet calculator embed
export default function LaunchBanner() {
  return <div className="bg-gradient-to-r from-violet-600 to-blue-600 text-white p-8 rounded-2xl">
    <h2>Wireline is LIVE with Grok-Powered Voice Agents + Hybrid Pricing</h2>
    <button onClick={() => window.location = '/signup?plan=starter&grok=true'}>Start 1-Agent Free → Scale Your Fleet</button>
  </div>;
}