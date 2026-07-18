import Foundation

/// Single source of truth for the Wireline backend origin and endpoint URLs.
enum WirelineConfig {
    private static let productionURL = URL(string: "https://trywireline.com")!
    private static let previewURL = URL(string: "https://wireline-chi.vercel.app")!
    private static let localURL = URL(string: "http://localhost:3000")!

    enum EndpointError: Error {
        case inlineQueryOrFragment(String)
        case invalidURL(String)
    }

    static var baseURL: URL {
        #if DEBUG
        if let envURL = ProcessInfo.processInfo.environment["WIRELINE_BASE_URL"],
           let url = URL(string: envURL) {
            return url
        }
        return previewURL
        #else
        return productionURL
        #endif
    }

    /// Build an API URL without treating query text as a path component.
    /// Callers must supply query values as URLQueryItem so Foundation performs
    /// correct encoding and `?` can never become a `%3F` path segment.
    static func endpoint(
        path: String,
        queryItems: [URLQueryItem] = []
    ) throws -> URL {
        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        guard !normalizedPath.contains("?"), !normalizedPath.contains("#") else {
            throw EndpointError.inlineQueryOrFragment(path)
        }
        guard let relativeURL = URL(string: normalizedPath, relativeTo: baseURL),
              var components = URLComponents(
                url: relativeURL.absoluteURL,
                resolvingAgainstBaseURL: false
              ) else {
            throw EndpointError.invalidURL(path)
        }
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        guard let url = components.url else {
            throw EndpointError.invalidURL(path)
        }
        return url
    }

    static let sessionCookieName = "wireline_session"
}
