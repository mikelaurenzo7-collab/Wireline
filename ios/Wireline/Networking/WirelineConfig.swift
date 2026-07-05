import Foundation

/// Single source of truth for the Wireline backend origin.
/// Production-ready with clear dev/preview/prod handling.
enum WirelineConfig {
    private static let productionURL = URL(string: "https://trywireline.com")!
    private static let previewURL = URL(string: "https://wireline-chi.vercel.app")!
    private static let localURL = URL(string: "http://localhost:3000")!

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

    static var mobileAPIBase: URL {
        baseURL.appendingPathComponent("/api/mobile")
    }

    static let sessionCookieName = "wireline_session"
}