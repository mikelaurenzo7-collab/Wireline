import Foundation

// Shared between the Wingman app target and the WingmanWidgets extension.
//
// The widget extension has no auth and no network access of its own, so the
// app fetches `/api/mobile/*` and writes a small snapshot into the shared App
// Group container; the widgets only ever READ it. Keep these types
// self-contained (no app-only models) so both targets compile against them.

public enum WingmanWidgetShared {
    /// App Group container shared by the app + widget extension. This string
    /// must match the App Group capability in BOTH targets' entitlements.
    public static let appGroupId = "group.com.wireline.wingman"

    /// Brand accent (Silky Purple), mirrored from `WingmanTheme` because the
    /// widget target cannot see the app's `Brand` tokens.
    public static let accentHex = "8B3FD6"
}

/// One glanceable recent call. Pre-formatted by the app so the widget stays a
/// dumb renderer (no date math / business logic in the extension).
public struct WingmanWidgetCall: Codable, Identifiable, Hashable {
    public let id: String
    public let title: String // display name or number
    public let subtitle: String // outcome / summary · relative time
    public let direction: String? // "inbound" | "outbound"
    public let sentiment: String? // "positive" | "neutral" | "negative"
    public let needsFollowUp: Bool
    /// Raw dialable number (E.164), when known — powers the "call back"
    /// deep link. Optional + defaulted so older snapshots still decode.
    public let number: String?

    public init(
        id: String,
        title: String,
        subtitle: String,
        direction: String?,
        sentiment: String?,
        needsFollowUp: Bool,
        number: String? = nil
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.direction = direction
        self.sentiment = sentiment
        self.needsFollowUp = needsFollowUp
        self.number = number
    }
}

public struct WingmanWidgetSnapshot: Codable, Hashable {
    public var recentCalls: [WingmanWidgetCall]
    public var needsAttention: Int
    public var activeCallLabel: String?
    public var balanceUsd: Double?
    public var signedIn: Bool
    public var updatedAt: Date

    public init(
        recentCalls: [WingmanWidgetCall] = [],
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

    /// Signed-out / no-data baseline.
    public static let empty = WingmanWidgetSnapshot()

    /// Sample data for the widget gallery + Xcode previews.
    public static let placeholder = WingmanWidgetSnapshot(
        recentCalls: [
            WingmanWidgetCall(
                id: "1",
                title: "Dr. Patel's office",
                subtitle: "Booked · 2m ago",
                direction: "outbound",
                sentiment: "positive",
                needsFollowUp: false,
                number: "+13125550142"
            ),
            WingmanWidgetCall(
                id: "2",
                title: "Westside Pharmacy",
                subtitle: "Left message · 1h ago",
                direction: "outbound",
                sentiment: "neutral",
                needsFollowUp: true,
                number: "+13125550174"
            ),
            WingmanWidgetCall(
                id: "3",
                title: "(312) 555-0188",
                subtitle: "Missed · 3h ago",
                direction: "inbound",
                sentiment: nil,
                needsFollowUp: true,
                number: "+13125550188"
            ),
        ],
        needsAttention: 2,
        activeCallLabel: nil,
        balanceUsd: 12.50,
        signedIn: true
    )
}

/// Reads/writes the snapshot in the shared App Group. The app calls `save`;
/// the widget calls `load`.
public enum WingmanWidgetStore {
    private static let key = "wingman.widget.snapshot.v1"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: WingmanWidgetShared.appGroupId)
    }

    public static func load() -> WingmanWidgetSnapshot {
        guard
            let data = defaults?.data(forKey: key),
            let snapshot = try? JSONDecoder().decode(WingmanWidgetSnapshot.self, from: data)
        else {
            return .empty
        }
        return snapshot
    }

    public static func save(_ snapshot: WingmanWidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: key)
    }
}
