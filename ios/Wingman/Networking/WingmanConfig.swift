import Foundation

/// Single source of truth for the backend origin. Point this at your
environment (local dev, preview, or production) — both the auth flow and
the authenticated API client read from here.
enum WingmanConfig {
    /// Production API origin for TestFlight/App Store builds.
    /// Override locally only in an uncommitted debug change.
    static var baseURL = URL(string: "https://trywireline.com")!

    /// The httpOnly session cookie the backend sets on sign-in. Its value is
    /// the JWT we reuse as the `Authorization: Bearer` token on /api/mobile/*.
    static let sessionCookieName = "wireline_session"

    /// Build API URLs without treating query strings as path components.
    ///
    /// `URL.appendingPathComponent("/api/mobile/calls/recent?limit=20")` can
    /// percent-encode the `?` and send the request to the wrong route. Keep path
    /// and query separate so every auth/mobile endpoint hits the intended URL.
    static func url(path: String, queryItems: [URLQueryItem] = []) -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return baseURL
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let requestPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + [basePath, requestPath]
            .filter { !$0.isEmpty }
            .joined(separator: "/")

        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        return components.url ?? baseURL
    }
}
