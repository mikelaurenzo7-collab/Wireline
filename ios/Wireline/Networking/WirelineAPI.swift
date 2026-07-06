import Foundation

/// Bearer-authenticated REST client for the Wireline mobile surface
/// (`/api/mobile/*`). Every request attaches the Keychain-stored JWT; the
/// backend treats this surface as Bearer-only.
actor WirelineAPI {
    static let shared = WirelineAPI()

    private var baseURL: URL { WirelineConfig.baseURL }

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

    func activeCalls() async throws -> [ActiveCall] {
        let list: ActiveCallList = try await get("/api/mobile/calls/active")
        return list.calls
    }

    func recentCalls(limit: Int = 20) async throws -> RecentCallsResponse {
        try await get("/api/mobile/calls/recent?limit=\(limit)")
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
        hasExpressWrittenConsent: Bool = false
    ) async throws -> String? {
        struct Body: Encodable {
            let agentId: String
            let customerNumber: String
            let context: String?
            let hasExpressWrittenConsent: Bool
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
                hasExpressWrittenConsent: hasExpressWrittenConsent
            )
        )
        return (try? JSONDecoder().decode(Result.self, from: data))?.callId
    }

    func signOutSession() async {
        guard let token = KeychainStore.loadToken() else { return }
        var req = URLRequest(url: baseURL.appendingPathComponent("/api/auth/signout"))
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try? await URLSession.shared.data(for: req)
    }

    // MARK: - Plumbing

    private func makeRequest(path: String, method: String) throws -> URLRequest {
        guard let token = KeychainStore.loadToken() else { throw APIError.notAuthenticated }
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return req
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let data = try await send(makeRequest(path: path, method: "GET"))
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(error) }
    }

    private func postRaw<B: Encodable>(_ path: String, body: B) async throws -> Data {
        var req = try makeRequest(path: path, method: "POST")
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req)
    }

    private func send(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { return data }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, body: String(decoding: data, as: UTF8.self))
        }
        return data
    }
}
