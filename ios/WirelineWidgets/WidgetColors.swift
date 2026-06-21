import SwiftUI

/// Widget palette shared by all extension views. Keep widgets visibly aligned
/// with the native Professional Heritage surfaces while using WidgetKit-friendly fills.
enum WidgetColors {
    static let accent = Color(hex: WirelinePalette.accent)
    static let accentDeep = Color(hex: WirelinePalette.accentDeep)
    static let accentSoft = Color(hex: WirelinePalette.accentSoft)
    static let canvas = Color(hex: WirelinePalette.canvas)
    static let panel = Color(hex: WirelinePalette.panel)
    static let panel2 = Color(hex: WirelinePalette.panel2)
    static let text = Color(hex: WirelinePalette.text)
    static let text2 = Color(hex: WirelinePalette.text2)
    static let text3 = Color(hex: WirelinePalette.text3)
    static let border = Color(hex: WirelinePalette.border)

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
