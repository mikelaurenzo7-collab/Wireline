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
    public static let accent = "2B5548"
    public static let accentDeep = "1E4038"
    public static let accentSoft = "EEF5F1"
    public static let canvas = "F7F6F3"
    public static let panel = "FFFFFF"
    public static let panel2 = "F0EFEB"
    public static let text = "1C1C1A"
    public static let text2 = "6B6B65"
    public static let text3 = "A1A19B"
    public static let border = "E8E7E3"
    public static let destructive = "A23A3A"
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
