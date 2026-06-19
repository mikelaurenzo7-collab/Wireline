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

/// Stitch Noir palette shared by the app and widget targets. The extension cannot
/// import app `Brand`, so this small immutable mirror is the only color source for widgets.
public enum WirelinePalette {
    public static let violet = "5D5CFF"
    public static let violetDeep = "4643E9"
    public static let violetSoft = "C1C1FF"
    public static let canvas = "0A0A0C"
    public static let panel = "131315"
    public static let panel2 = "1B1B1D"
    public static let text = "F4F2F7"
    public static let text2 = "C7C4D8"
    public static let text3 = "908FA1"
    public static let destructive = "EF4444"
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
