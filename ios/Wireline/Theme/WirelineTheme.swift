import SwiftUI

/// Wireline's native foundation: quiet warm surfaces, direct typography, and one
/// high-contrast action color. It intentionally matches the active web product.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = Color(hex: 0xF7F7F5)
    static let panel = Color.white
    static let panel2 = Color(hex: 0xF2F2EF)
    static let raised = Color(hex: 0xEAEAE6)

    // ── Text ────────────────────────────────────────────────────────────────
    static let text = Color(hex: 0x1D1D1F)
    static let text2 = Color(hex: 0x54545B)
    static let text3 = Color(hex: 0x6E6E73)

    // ── Accent ──────────────────────────────────────────────────────────────
    static let accent = Color(hex: 0x1D1D1F)
    static let accentSoft = Color(hex: 0xEAEAE6)
    static let accentDeep = Color.black
    static let accentTint = Color(hex: 0x1D1D1F, opacity: 0.08)

    // ── Semantic ────────────────────────────────────────────────────────────
    static let destructive = Color(hex: 0xB42318)
    static let signal = text3
    static let success = Color(hex: 0x267A52)

    // ── Compatibility aliases ───────────────────────────────────────────────
    static let violet = accent
    static let violetSoft = accentSoft
    static let violetDeep = accentDeep
    static let purple = accent
    static let purpleDeep = accentDeep
    static let paper = canvas
    static let paperWarm = panel2
    static let ink = text

    // ── Radius ──────────────────────────────────────────────────────────────
    static let radiusSm: CGFloat = 10
    static let radiusMd: CGFloat = 16
    static let radiusLg: CGFloat = 24
}

extension Color {
    /// Opaque RGB from a 24-bit hex literal, e.g. `Color(hex: 0x1D1D1F)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .bold) -> Font {
        Font.system(style, design: .rounded).weight(weight)
    }

    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        Font.system(style, design: .monospaced).weight(weight)
    }

    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .default).weight(weight)
    }
}

struct TouchPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.78 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

struct BrandMeshBackground: View {
    var body: some View {
        LinearGradient(
            colors: [Brand.canvas, Brand.panel2.opacity(0.74), Brand.canvas],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }
}

extension View {
    /// Standard Wireline shell. Views remain deliberately light and legible.
    func wirelineBrand() -> some View {
        self.tint(Brand.accent)
            .scrollContentBackground(.hidden)
            .background(BrandMeshBackground())
            .preferredColorScheme(.light)
    }

    func touchPress() -> some View {
        buttonStyle(TouchPressStyle())
    }

    /// Quiet elevated card for grouped information and actions.
    func brandGlowCard(radius: CGFloat = Brand.radiusMd, borderOpacity: Double = 0.9) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.raised.opacity(borderOpacity), lineWidth: 1)
            )
    }
}