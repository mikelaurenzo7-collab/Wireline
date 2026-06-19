import SwiftUI

// Lavender Noir widget colors — shared palette for extension targets.
enum WidgetColors {
    static let violet = Color(hex: WirelinePalette.violet)
    static let violetDeep = Color(hex: WirelinePalette.violetDeep)
    static let violetSoft = Color(hex: WirelinePalette.violetSoft)
    static let canvas = Color(hex: WirelinePalette.canvas)
    static let panel = Color(hex: WirelinePalette.panel)
    static let text = Color(hex: WirelinePalette.text)
    static let text2 = Color(hex: WirelinePalette.text2)

    static var violetGradient: LinearGradient {
        LinearGradient(
            colors: [violet, violetDeep],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255.0
        let g = Double((int >> 8) & 0xFF) / 255.0
        let b = Double(int & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b)
    }
}
