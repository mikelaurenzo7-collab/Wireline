import Foundation

// Codable mirrors of the /api/mobile/* JSON payloads. Field names use the
// snake_case the backend emits, mapped to Swift camelCase via CodingKeys.

enum AccountMode: String, Codable {
    case personal
    case business
}

struct MobileMe: Codable {
    let user: User
    let account: Account
    let agents: AgentQuota
    let extraAgent: ExtraAgent

    struct User: Codable {
        let id: String
        let email: String
        let fullName: String?
        enum CodingKeys: String, CodingKey { case id, email, fullName = "full_name" }
    }

    struct Account: Codable {
        let mode: AccountMode
        let planId: String
        let planName: String
        let businessName: String?
        let subscriptionStatus: String
        enum CodingKeys: String, CodingKey {
            case mode
            case planId = "plan_id"
            case planName = "plan_name"
            case businessName = "business_name"
            case subscriptionStatus = "subscription_status"
        }
    }

    struct AgentQuota: Codable {
        let count: Int
        let included: Int?
        let extras: Int
        let effectiveCap: Int?
        let unlimited: Bool
        let canAddMore: Bool
        enum CodingKeys: String, CodingKey {
            case count, included, extras, unlimited
            case effectiveCap = "effective_cap"
            case canAddMore = "can_add_more"
        }
    }

    struct ExtraAgent: Codable {
        let priceUsd: Double?
        let configured: Bool
        enum CodingKeys: String, CodingKey {
            case priceUsd = "price_usd"
            case configured
        }
    }

    struct Settings: Codable {
        let handoffPhone: String?
        enum CodingKeys: String, CodingKey { case handoffPhone = "handoff_phone" }
    }

    let settings: Settings?

    enum CodingKeys: String, CodingKey {
        case user, account, agents, settings
        case extraAgent = "extra_agent"
    }
}

struct Agent: Codable, Identifiable {
    let id: String
    let name: String
    let role: String?
    let archetype: String?
    let channels: [String]?
    let voiceId: String?
    let isBusinessAgent: Bool?
    enum CodingKeys: String, CodingKey {
        case id, name, role, archetype, channels
        case voiceId = "voiceId"
        case isBusinessAgent
    }
}

struct AgentList: Codable {
    let agents: [Agent]
}

struct AgentRole: Codable, Identifiable {
    let id: String
    let label: String
    let archetype: String
}

struct AgentRoleList: Codable {
    let roles: [AgentRole]
}

struct ActiveCall: Codable, Identifiable {
    let callId: String
    let agentId: String?
    let customerNumber: String?
    let status: String?
    let label: String?
    let type: String?
    var id: String { callId }
}

struct ActiveCallList: Codable {
    let calls: [ActiveCall]
}

struct RecentCall: Codable, Identifiable {
    let id: String
    let agentId: String?
    let direction: String?
    let customerNumber: String?
    let durationSeconds: Int?
    let summary: String?
    let sentiment: String?
    let outcomeTag: String?
    let intentLabel: String?
    let createdAt: String?
}

struct RecentCallsResponse: Codable {
    let calls: [RecentCall]
    let needsAttention: Int
}

struct CallDetail: Codable {
    let id: String
    let agentId: String?
    let direction: String?
    let customerNumber: String?
    let durationSeconds: Int?
    let summary: String?
    let transcript: String?
    let sentiment: String?
    let outcomeTag: String?
    let intentLabel: String?
    let recordingUrl: String?
    let createdAt: String?
}

struct CallDetailResponse: Codable {
    let call: CallDetail
}

struct WalletEntry: Codable, Identifiable {
    let id: String
    let deltaUsd: Double
    let balanceAfterUsd: Double
    let reason: String
    let createdAt: String?
    enum CodingKeys: String, CodingKey {
        case id, reason
        case deltaUsd = "deltaUsd"
        case balanceAfterUsd = "balanceAfterUsd"
        case createdAt = "createdAt"
    }
}

struct WalletResponse: Codable {
    let balanceUsd: Double
    let ledger: [WalletEntry]
    enum CodingKeys: String, CodingKey {
        case balanceUsd = "balance_usd"
        case ledger
    }
}

/// Payload carried by an inbound-call VoIP push (see src/lib/apns-push.ts).
struct IncomingCallPush: Codable {
    let callId: String
    let from: String
    let agentName: String?
    let agentId: String?
}
