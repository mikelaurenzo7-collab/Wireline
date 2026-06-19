import SwiftUI

/// Wireline brand layer — Stitch Noir native.
/// Tokens mirror the web Stitch Studio migration: near-black canvas, charcoal
/// glass panels, violet primary action, lavender accents, and compact system UI.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = Color(hex: 0x0A0A0C)
    static let panel = Color(hex: 0x131315)
    static let panel2 = Color(hex: 0x1B1B1D)
    static let raised = Color(hex: 0x242428)

    // ── Text ────────────────────────────────────────────────────────────────
    static let text = Color(hex: 0xF4F2F7)
    static let text2 = Color(hex: 0xC7C4D8)
    static let text3 = Color(hex: 0x908FA1)

    // ── Violet accent ───────────────────────────────────────────────────────
    static let violet = Color(hex: 0x5D5CFF)
    static let violetSoft = Color(hex: 0xC1C1FF)
    static let violetDeep = Color(hex: 0x4643E9)
    static let accentTint = Color(hex: 0x5D5CFF, opacity: 0.14)

    // ── Semantic ────────────────────────────────────────────────────────────
    static let destructive = Color(hex: 0xEF4444)
    static let signal = violetSoft
    static let success = Color(hex: 0x3DDCBA)

    // ── Legacy aliases ──────────────────────────────────────────────────────
    static let purple = violet
    static let purpleDeep = violetDeep
    static let paper = canvas
    static let paperWarm = panel
    static let ink = text

    // ── Radius ──────────────────────────────────────────────────────────────
    static let radiusSm: CGFloat = 8
    static let radiusMd: CGFloat = 14
    static let radiusLg: CGFloat = 24
}

extension Color {
    /// Opaque RGB from a 24-bit hex literal, e.g. `Color(hex: 0x5D5CFF)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .bold) -> Font {
        Font.system(style, design: .serif).weight(weight)
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
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.24, dampingFraction: 0.62, blendDuration: 0), value: configuration.isPressed)
    }
}

struct BrandMeshBackground: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Brand.canvas
                Circle()
                    .fill(Brand.violet.opacity(0.26))
                    .frame(width: proxy.size.width * 0.82)
                    .blur(radius: 86)
                    .offset(x: -proxy.size.width * 0.28, y: -proxy.size.height * 0.36)
                Circle()
                    .fill(Brand.violetSoft.opacity(0.12))
                    .frame(width: proxy.size.width * 0.68)
                    .blur(radius: 92)
                    .offset(x: proxy.size.width * 0.32, y: -proxy.size.height * 0.22)
                Circle()
                    .fill(Brand.success.opacity(0.07))
                    .frame(width: proxy.size.width * 0.7)
                    .blur(radius: 100)
                    .offset(x: -proxy.size.width * 0.1, y: proxy.size.height * 0.38)
                LinearGradient(
                    colors: [Color.white.opacity(0.04), Color.clear, Color.black.opacity(0.34)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
            .ignoresSafeArea()
        }
    }
}

extension View {
    /// Stitch Noir shell: violet tint, near-black canvas, dark color scheme.
    func wirelineBrand() -> some View {
        self.tint(Brand.violet)
            .scrollContentBackground(.hidden)
            .background(BrandMeshBackground())
            .preferredColorScheme(.dark)
    }

    func touchPress() -> some View {
        buttonStyle(TouchPressStyle())
    }

    /// Glassy panel card matching web `.stitch-panel`.
    func brandGlowCard(radius: CGFloat = Brand.radiusLg, borderOpacity: Double = 0.16) -> some View {
        background(
            LinearGradient(
                colors: [Brand.panel2.opacity(0.92), Brand.panel.opacity(0.86)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .stroke(Color.white.opacity(borderOpacity), lineWidth: 1)
        )
    }
}
