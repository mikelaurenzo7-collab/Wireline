import Foundation

/// Single source of truth for the backend origin. Point this at your
/// environment (local dev, preview, or production) — both the auth flow and
/// the authenticated API client read from here.
enum WingmanConfig {
    /// e.g. http://localhost:3000 for the dev server, or your Vercel URL.
    static var baseURL = URL(string: "https://app.wireline.example")!

    /// The httpOnly session cookie the backend sets on sign-in. Its value is
    /// the JWT we reuse as the `Authorization: Bearer` token on /api/mobile/*.
    static let sessionCookieName = "wireline_session"
}
