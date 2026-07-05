import Foundation

// Shared between the Wireline app target and WirelineWidgets.
// The extension does not authenticate or make network requests; the app writes
// a compact snapshot to the shared App Group and widgets only render that data.

public enum WirelineWidgetShared {
    public static let appGroupId = "group.com.wireline.assistant"
}

/// Legacy hex mirror for App Group snapshots. Prefer WirelineDesignTokens in widget views.
/// Regenerate ios/WirelineShared/WirelineDesignTokens.generated.swift via `node scripts/build-design-tokens.mjs`.
public enum WirelinePalette {
    public static let accent = "A78BFA"
    public static let accentDeep = "8B5CF6"
    public static let accentSoft = "1E1730"
    public static let canvas = "0A0A0E"
    public static let panel = "141319"
    public static let panel2 = "18161E"
    public static let text = "F5F4F8"
    public static let text2 = "B6B1C6"
    public static let text3 = "8B87A0"
    public static let border = "262430"
    public static let destructive = "EF7B92"
}

public struct WirelineWidgetCall: Codable, Identifiable, Hashable {
    public let id: String
    public let title: String
    public let subtitle: String
    public let direction: String?
    public let sentiment: String?
    public let needsFollowUp: Bool

    public init(
        id: String,
        title: String,
        subtitle: String,
        direction: String?,
        sentiment: String?,
        needsFollowUp: Bool
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.direction = direction
        self.sentiment = sentiment
        self.needsFollowUp = needsFollowUp
    }
}

public struct WirelineWidgetSnapshot: Codable, Hashable {
    public var recentCalls: [WirelineWidgetCall]
    public var needsAttention: Int
    public var activeCallLabel: String?
    public var balanceUsd: Double?
    public var signedIn: Bool
    public var updatedAt: Date

    public init(
        recentCalls: [WirelineWidgetCall] = [],
        needsAttention: Int = 0,
        activeCallLabel: String? = nil,
        balanceUsd: Double? = nil,
        signedIn: Bool = false,
        updatedAt: Date = Date()
    ) {
        self.recentCalls = recentCalls
        self.needsAttention = needsAttention
        self.activeCallLabel = activeCallLabel
        self.balanceUsd = balanceUsd
        self.signedIn = signedIn
        self.updatedAt = updatedAt
    }

    public static let empty = WirelineWidgetSnapshot()
    public static let placeholder = WirelineWidgetSnapshot(
        recentCalls: [
            WirelineWidgetCall(
                id: "call-1",
                title: "Doctor's Office",
                subtitle: "Prescription ready — picked up",
                direction: "outbound",
                sentiment: "positive",
                needsFollowUp: false
            ),
            WirelineWidgetCall(
                id: "call-2",
                title: "Restaurant",
                subtitle: "Reservation moved to 7:30 PM",
                direction: "outbound",
                sentiment: "positive",
                needsFollowUp: false
            ),
            WirelineWidgetCall(
                id: "call-3",
                title: "Airline Support",
                subtitle: "Seat change requested — awaiting confirmation",
                direction: "outbound",
                sentiment: "neutral",
                needsFollowUp: true
            )
        ],
        needsAttention: 1,
        balanceUsd: 24.50
    )
}

public enum WirelineWidgetStore {
    private static let defaults = UserDefaults(suiteName: WirelineWidgetShared.appGroupId)
    private static let snapshotKey = "wireline_widget_snapshot"

    public static func load() -> WirelineWidgetSnapshot {
        guard
            let data = defaults?.data(forKey: snapshotKey),
            let snapshot = try? JSONDecoder().decode(WirelineWidgetSnapshot.self, from: data)
        else {
            return .empty
        }
        return snapshot
    }

    public static func save(_ snapshot: WirelineWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: snapshotKey)
    }
}
