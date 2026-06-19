import SwiftUI

/// Wireline brand layer — **Lavender Noir** (native dark).
/// Tokens mirror `src/index.css` `.dark` + `:root` violet scale so iOS, Android,
/// widgets, and the web stay one product. iOS-native first: SF Pro, system
/// materials, standard controls; violet is the single electricity accent.
enum Brand {
    // ── The Three (dark native) ─────────────────────────────────────────────
    /// `--canvas` / `--charcoal` — app background.
    static let canvas = Color(hex: 0x1E1B2E)
    /// `--panel` — cards, grouped lists.
    static let panel = Color(hex: 0x2A2540)
    /// `--panel-2` — nested surfaces, inputs.
    static let panel2 = Color(hex: 0x342E4C)
    /// `--raised` — hover / elevated chips.
    static let raised = Color(hex: 0x3D3654)

    // ── Text ────────────────────────────────────────────────────────────────
    static let text = Color(hex: 0xF3EFFA)
    static let text2 = Color(hex: 0xB8B0CA)
    static let text3 = Color(hex: 0x7A7194)

    // ── Violet accent (`--violet` family) ───────────────────────────────────
    static let violet = Color(hex: 0x7C3AED)
    static let violetSoft = Color(hex: 0xA78BFA)
    static let violetDeep = Color(hex: 0x5B21B6)
    /// `--violet-glass` — tinted chips / selected rows.
    static let accentTint = Color(hex: 0x7C3AED, opacity: 0.10)

    // ── Semantic ────────────────────────────────────────────────────────────
    static let destructive = Color(hex: 0xDC2626)
    /// Live / positive — violet-soft reads as "on" in Lavender Noir.
    static let signal = violetSoft

    // ── Legacy aliases (gradual migration) ────────────────────────────────
    static let purple = violet
    static let purpleDeep = violetDeep
    static let paper = canvas
    static let paperWarm = panel
    static let ink = text

    // ── Radius (matches `--radius-*` in index.css) ────────────────────────
    static let radiusSm: CGFloat = 8
    static let radiusMd: CGFloat = 14
    static let radiusLg: CGFloat = 20
}

extension Color {
    /// Opaque RGB from a 24-bit hex literal, e.g. `Color(hex: 0x7C3AED)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    /// Display — native serif approximates Fraunces for headlines.
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .bold) -> Font {
        Font.system(style, design: .serif).weight(weight)
    }

    /// Mono — native monospaced approximates JetBrains Mono for labels.
    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        Font.system(style, design: .monospaced).weight(weight)
    }

    /// UI body — SF Pro approximates Plus Jakarta Sans.
    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .default).weight(weight)
    }
}

struct TouchPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.55, blendDuration: 0), value: configuration.isPressed)
    }
}

extension View {
    /// Lavender Noir shell: violet tint, charcoal canvas, dark color scheme.
    func wirelineBrand() -> some View {
        self.tint(Brand.violet)
            .scrollContentBackground(.hidden)
            .background(Brand.canvas.ignoresSafeArea())
            .preferredColorScheme(.dark)
    }

    func touchPress() -> some View {
        buttonStyle(TouchPressStyle())
    }

    /// Panel card with hairline violet border — matches web `.wl-panel`.
    func brandGlowCard(radius: CGFloat = Brand.radiusMd, borderOpacity: Double = 0.10) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .stroke(Brand.violet.opacity(borderOpacity), lineWidth: 1)
            )
    }
}
