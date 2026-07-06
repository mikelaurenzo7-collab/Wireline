import Foundation

enum MobileAssistantCreation {
    static func create(
        name: String,
        role: String = "scheduler",
        isBusinessAgent: Bool = false
    ) async throws -> Agent {
        struct Payload: Encodable {
            let name: String
            let role: String
            let deferPhoneProvision: Bool
            let isBusinessAgent: Bool

            enum CodingKeys: String, CodingKey {
                case name, role
                case deferPhoneProvision
                case isBusinessAgent = "is_business_agent"
            }
        }

        guard let token = KeychainStore.loadToken() else {
            throw WirelineAPI.APIError.notAuthenticated
        }
        var request = URLRequest(url: WirelineConfig.baseURL.appendingPathComponent("/api/mobile/agents"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            Payload(
                name: name,
                role: role,
                deferPhoneProvision: true,
                isBusinessAgent: isBusinessAgent
            )
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw WirelineAPI.APIError.http(status: status, body: String(decoding: data, as: UTF8.self))
        }
        do {
            return try JSONDecoder().decode(Agent.self, from: data)
        } catch {
            throw WirelineAPI.APIError.decoding(error)
        }
    }
}