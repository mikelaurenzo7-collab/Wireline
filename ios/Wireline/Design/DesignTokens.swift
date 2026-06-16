import SwiftUI

/// Grok Certified Unified Design System Tokens
/// Matches Web (Tailwind) and Android (Compose) exactly.
/// Single source of truth for robofuturistic brutalist aesthetic.
enum DesignTokens {
    // Colors
    static let darkBase = Color(hex: "#0a0a0f")
    static let cyan = Color(hex: "#00F5FF")
    static let magenta = Color(hex: "#FF00AA")
    static let glass = Color.white.opacity(0.08)

    // Corners (sharp brutalist)
    static let cornerSmall: CGFloat = 4
    static let cornerMedium: CGFloat = 8
    static let cornerLarge: CGFloat = 12

    // Typography scale (can be extended)
    static let titleFont = Font.system(size: 28, weight: .semibold, design: .default)
    static let bodyFont = Font.system(size: 17, weight: .regular)
    static let monoFont = Font.system(size: 15, weight: .medium, design: .monospaced)
}

// Convenience extensions
extension View {
    func wirelineCard() -> some View {
        self
            .background(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: DesignTokens.cornerMedium)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: DesignTokens.cornerMedium))
    }

    func sharpBrutalist() -> some View {
        self.clipShape(RoundedRectangle(cornerRadius: DesignTokens.cornerSmall))
    }

    func wirelineAccent(_ color: Color = DesignTokens.cyan) -> some View {
        self.foregroundStyle(color)
    }
}

// Hex color helper (add once if not already present)
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}