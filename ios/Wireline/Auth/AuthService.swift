import Foundation
import SwiftUI

/// Observable sign-in state for the app shell. On sign-in we POST to the
/// existing `/api/auth/signin`, then pull the JWT out of the `wireline_session`
/// cookie the backend returns and stash it in the Keychain — from then on every
/// `/api/mobile/*` request authenticates with `Authorization: Bearer <jwt>`.
///
/// Why the cookie value works as a Bearer token: `getSessionTokenFromRequest`
/// on the backend accepts either the cookie or a Bearer header, and the cookie
/// value *is* the signed JWT. `httpOnly` only hides a cookie from browser
/// JavaScript — native URLSession clients can still read it.
@MainActor
final class AuthService: ObservableObject {
    @Published var isSignedIn: Bool = KeychainStore.loadToken() != nil
    @Published var isWorking = false
    @Published var errorMessage: String?
    @Published var accountType: String = "business" // "personal" or "business"

    func signIn(email: String, password: String) async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let (token, accType) = try await Self.requestSessionToken(email: email, password: password)
            KeychainStore.saveToken(token)
            self.accountType = accType
            isSignedIn = true
            await CallManager.shared.refreshDeviceRegistration()
        } catch {
            errorMessage = (error as? AuthError)?.message ?? error.localizedDescription
        }
    }

    func signOut() {
        Task {
            await CallManager.shared.unregisterDevice()
            await WirelineAPI.shared.signOutSession()
        }
        KeychainStore.clear()
        isSignedIn = false
    }

    enum AuthError: Error {
        case badCredentials
        case noSessionCookie
        case server(String)

        var message: String {
            switch self {
            case .badCredentials: return "Incorrect email or password."
            case .noSessionCookie: return "Sign-in succeeded but no session was returned."
            case let .server(msg): return msg
            }
        }
    }

    /// POST /api/auth/signin and extract the session JWT from the Set-Cookie header.
    private static func requestSessionToken(email: String, password: String) async throws -> (String, String) {
        var req = URLRequest(url: WirelineConfig.baseURL.appendingPathComponent("/api/auth/signin"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["email": email, "password": password])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw AuthError.server("No response from server.")
        }
        guard http.statusCode == 200 else {
            if http.statusCode == 401 { throw AuthError.badCredentials }
            throw AuthError.server("Sign-in failed (\(http.statusCode)).")
        }

        var accountType = "business"
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let user = json["user"] as? [String: Any],
           let mode = user["account_type"] as? String {
            accountType = mode
        }

        // Pull the session JWT out of the Set-Cookie response headers.
        let headers = http.allHeaderFields as? [String: String] ?? [:]
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headers, for: WirelineConfig.baseURL)
        if let session = cookies.first(where: { $0.name == WirelineConfig.sessionCookieName }) {
            return (session.value, accountType)
        }
        // Fall back to the shared cookie storage, which URLSession also populates.
        if let session = HTTPCookieStorage.shared.cookies(for: WirelineConfig.baseURL)?
            .first(where: { $0.name == WirelineConfig.sessionCookieName }) {
            return (session.value, accountType)
        }
        throw AuthError.noSessionCookie
    }
}
