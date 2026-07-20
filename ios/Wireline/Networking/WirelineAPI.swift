import Foundation

/// Bearer-authenticated REST client for the Wireline mobile surface
/// (`/api/mobile/*`). Every request attaches the Keychain-stored JWT; the
/// backend treats this surface as Bearer-only.
actor WirelineAPI {
    static let shared = WirelineAPI()

    private var refreshInFlight: Task<String, Error>?

    enum APIError: Error {
        case notAuthenticated
        case http(status: Int, body: String)
        case decoding(Error)
    }

    // MARK: - Reads

    func me() async throws -> MobileMe {
        try await get("/api/mobile/me")
    }

    func agents() async throws -> [Agent] {
        let list: AgentList = try await get("/api/mobile/agents")
        return list.agents
    }

    func agentRoles() async throws -> [AgentRole] {
        let list: AgentRoleList = try await get("/api/mobile/agents/roles")
        return list.roles
    }

    func activeCalls() async throws -> [ActiveCall] {
        let list: ActiveCallList = try await get("/api/mobile/calls/active")
        return list.calls
    }

    func recentCalls(limit: Int = 20) async throws -> RecentCallsResponse {
        let boundedLimit = min(max(limit, 1), 100)
        return try await get(
            "/api/mobile/calls/recent",
            queryItems: [URLQueryItem(name: "limit", value: String(boundedLimit))]
        )
    }

    func wallet() async throws -> WalletResponse {
        try await get("/api/mobile/wallet")
    }

    func callDetail(id: String) async throws -> CallDetail {
        let resp: CallDetailResponse = try await get("/api/mobile/calls/\(id)/detail")
        return resp.call
    }

    // MARK: - Writes

    /// Register/refresh this device's APNs tokens so the backend can wake it
    /// with a VoIP push on inbound calls.
    func registerDevice(deviceId: String, voipToken: String?, alertToken: String?) async throws {
        struct Body: Encodable {
            let device_id: String
            let apns_voip_token: String?
            let apns_alert_token: String?
            let platform = "ios"
            let app_version: String?
        }
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let body = Body(
            device_id: deviceId,
            apns_voip_token: voipToken,
            apns_alert_token: alertToken,
            app_version: version
        )
        _ = try await postRaw("/api/mobile/devices", body: body)
    }

    func unregisterDevice(deviceId: String) async throws {
        _ = try await send(makeRequest(path: "/api/mobile/devices/\(deviceId)", method: "DELETE"))
    }

    /// Save the operator's callback number (for "take this call" handoffs).
    func setHandoffPhone(_ phone: String?) async throws {
        struct Body: Encodable { let handoffPhone: String? }
        var req = try makeRequest(path: "/api/mobile/settings", method: "PUT")
        req.httpBody = try JSONEncoder().encode(Body(handoffPhone: phone))
        _ = try await send(req)
    }

    /// "Take this call" — transfer a live call to the saved callback number
    /// (or `to` when provided). Throws APIError.http on 400/404/409 so the UI
    /// can prompt for a number or explain why it can't take over yet.
    func handoffCall(callId: String, to: String? = nil) async throws {
        struct Body: Encodable { let to: String? }
        _ = try await postRaw("/api/mobile/calls/\(callId)/handoff", body: Body(to: to))
    }

    /// Place an outbound call through one of the user's agents.
    /// `context` is the free-text instruction ("running 5 minutes late").
    @discardableResult
    func placeCall(
        agentId: String,
        to number: String,
        context: String?,
        callPurpose: String = "service_or_requested",
        hasExpressWrittenConsent: Bool = false
    ) async throws -> String? {
        struct Body: Encodable {
            let agentId: String
            let customerNumber: String
            let context: String?
            let callPurpose: String
            let hasExpressWrittenConsent: Bool
            let consentSource: String?
        }
        struct Result: Decodable {
            let success: Bool
            let callId: String?
        }
        let data = try await postRaw(
            "/api/mobile/calls/outbound",
            body: Body(
                agentId: agentId,
                customerNumber: number,
                context: context,
                callPurpose: callPurpose,
                hasExpressWrittenConsent: hasExpressWrittenConsent,
                consentSource: hasExpressWrittenConsent ? "manual_attestation" : nil
            )
        )
        return (try? JSONDecoder().decode(Result.self, from: data))?.callId
    }

    func signOutSession() async {
        guard let token = KeychainStore.loadToken(),
              let url = try? WirelineConfig.endpoint(path: "/api/auth/signout") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: req)
    }

    /// Queue account deletion after the user types DELETE to confirm.
    func deleteAccount() async throws {
        struct Body: Encodable { let confirmation = "DELETE" }
        _ = try await postRaw("/api/account/delete", body: Body())
    }

    // MARK: - Plumbing

    private func makeRequest(
        path: String,
        method: String,
        queryItems: [URLQueryItem] = []
    ) throws -> URLRequest {
        guard let token = KeychainStore.loadToken() else { throw APIError.notAuthenticated }
        let url = try WirelineConfig.endpoint(path: path, queryItems: queryItems)
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return req
    }

    private func get<T: Decodable>(
        _ path: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> T {
        let data = try await send(
            makeRequest(path: path, method: "GET", queryItems: queryItems)
        )
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(error) }
    }

    private func postRaw<B: Encodable>(_ path: String, body: B) async throws -> Data {
        var req = try makeRequest(path: path, method: "POST")
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req)
    }

    private func send(_ req: URLRequest, retriedAfterRefresh: Bool = false) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { return data }

        if http.statusCode == 401, !retriedAfterRefresh {
            do {
                let newToken = try await rotateSessionToken()
                var retry = req
                retry.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                return try await send(retry, retriedAfterRefresh: true)
            } catch {
                await notifySessionExpired()
                throw APIError.notAuthenticated
            }
        }

        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, body: String(decoding: data, as: UTF8.self))
        }
        return data
    }

    private func rotateSessionToken() async throws -> String {
        if let refreshInFlight {
            return try await refreshInFlight.value
        }
        let task = Task<String, Error> {
            let token = try await AuthService.refreshSessionToken()
            KeychainStore.saveToken(token)
            return token
        }
        refreshInFlight = task
        do {
            let token = try await task.value
            refreshInFlight = nil
            return token
        } catch {
            refreshInFlight = nil
            throw error
        }
    }

    private func notifySessionExpired() async {
        await MainActor.run {
            NotificationCenter.default.post(name: .wirelineSessionExpired, object: nil)
        }
    }
}
