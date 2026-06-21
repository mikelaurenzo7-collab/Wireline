import Foundation

struct MobileAgentSetup: Decodable {
    let enabledTools: [String]
    let personality: String
    let directives: [MobileSetupEntry]
    let knowledge: [MobileSetupEntry]

    enum CodingKeys: String, CodingKey {
        case enabledTools
        case personality
        case directives
        case knowledge
    }
}

struct MobileSetupEntry: Decodable, Identifiable {
    let content: String
    var id: String { content }
}
