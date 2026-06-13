import SwiftUI

/// Minimal brand tokens for the widget target. The app's `WingmanTheme`/`Brand`
/// lives in the app target and isn't visible here, so mirror just the accent
/// plus a hex initializer (kept in sync with `WingmanWidgetShared.accentHex`).
enum WidgetBrand {
    static let accent = Color(hex: WingmanWidgetShared.accentHex)
}

extension Color {
    /// `"8B3FD6"` or `"#8B3FD6"` → Color. Falls back to gray on a bad string.
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var value: UInt64 = 0
        guard Scanner(string: cleaned).scanHexInt64(&value), cleaned.count == 6 else {
            self = .gray
            return
        }
        self = Color(
            red: Double((value & 0xFF0000) >> 16) / 255.0,
            green: Double((value & 0x00FF00) >> 8) / 255.0,
            blue: Double(value & 0x0000FF) / 255.0
        )
    }
}

/// Maps a backend sentiment string to a dot color. Off-brand greens/reds are
/// fine here — these are status glyphs, not chrome.
func sentimentColor(_ sentiment: String?) -> Color {
    switch sentiment?.lowercased() {
    case "positive": return .green
    case "negative": return .red
    case "neutral": return .secondary
    default: return .secondary
    }
}
