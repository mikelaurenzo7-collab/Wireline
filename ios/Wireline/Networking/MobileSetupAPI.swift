import Foundation

enum MobileSetupAPI {
    static func load(agentId: String) async throws -> MobileAgentSetup {
        try await request(path: "/api/mobile/agents/\(escaped(agentId))/config", method: "GET")
    }

    static func save(agentId: String, type: String, content: String) async throws {
        struct Payload: Encodable { let type: String; let content: String }
        let _: EmptyResponse = try await request(
            path: "/api/mobile/agents/\(escaped(agentId))/config/manual",
            method: "POST",
            body: Payload(type: type, content: content)
        )
    }

    static func updateActions(agentId: String, enabled: [String]) async throws {
        struct Payload: Encodable { let enabled_tools: [String] }
        let _: EmptyResponse = try await request(
            path: "/api/mobile/agents/\(escaped(agentId))/tools",
            method: "POST",
            body: Payload(enabled_tools: enabled)
        )
    }

    private struct EmptyResponse: Decodable {}

    private static func request<T: Decodable>(path: String, method: String) async throws -> T {
        try await request(path: path, method: method, body: Optional<String>.none)
    }

    private static func request<T: Decodable, Body: Encodable>(path: String, method: String, body: Body?) async throws -> T {
        guard let token = KeychainStore.loadToken() else { throw WirelineAPI.APIError.notAuthenticated }
        var request = URLRequest(url: WirelineConfig.baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw WirelineAPI.APIError.http(status: status, body: String(decoding: data, as: UTF8.self))
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw WirelineAPI.APIError.decoding(error) }
    }

    private static func escaped(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
}
