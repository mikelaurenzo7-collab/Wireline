import Foundation

// Shared between the Wireline Assistant app target and the WirelineWidgets extension.
//
// The widget extension has no auth and no network access of its own, so the
// app fetches `/api/mobile/*` and writes a small snapshot into the shared App
// Group container; the widgets only ever READ it. Keep these types
// self-contained (no app-only models) so both targets compile against them.

public enum WirelineWidgetShared {
    /// App Group container shared by the app + widget extension.
    public static let appGroupId = "group.com.wireline.assistant"
}

/// Lavender Noir palette — mirrors `src/index.css` (widget target cannot import app `Brand`).
public enum WirelinePalette {
    public static let violet = "7C3AED"
    public static let violetDeep = "5B21B6"
    public static let violetSoft = "A78BFA"
    public static let canvas = "1E1B2E"
    public static let panel = "2A2540"
    public static let panel2 = "342E4C"
    public static let text = "F3EFFA"
    public static let text2 = "B8B0CA"
    public static let text3 = "7A7194"
    public static let destructive = "DC2626"

    /// @deprecated Use `violet` — kept for older widget code paths.
    public static let accentHex = violet
}

/// One glanceable recent call. Pre-formatted by the app so the widget stays a
/// dumb renderer (no date math / business logic in the extension).
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
