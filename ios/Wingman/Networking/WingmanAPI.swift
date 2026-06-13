import Foundation

/// Bearer-authenticated REST client for the Wireline mobile surface
/// (`/api/mobile/*`). Every request attaches the Keychain-stored JWT; the
/// backend treats this surface as Bearer-only.
actor WingmanAPI {
    static let shared = WingmanAPI()

    /// Point this at your environment, e.g. https://app.wireline.example.
    var baseURL = URL(string: "https://app.wireline.example")!

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

    /// Place an outbound call through one of the user's agents.
    /// `context` is the free-text instruction ("running 5 minutes late").
    @discardableResult
    func placeCall(agentId: String, to number: String, context: String?) async throws -> String? {
        struct Body: Encodable {
            let agentId: String
            let customerNumber: String
            let context: String?
        }
        struct Result: Decodable {
            let success: Bool
            let callId: String?
        }
        let data = try await postRaw(
            "/api/mobile/calls/outbound",
            body: Body(agentId: agentId, customerNumber: number, context: context)
        )
        return (try? JSONDecoder().decode(Result.self, from: data))?.callId
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
