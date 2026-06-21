import SwiftUI

/// Native Wireline foundation. This is the mobile translation of the Stitch
/// Precision system: warm paper surfaces, compact geometry, quiet borders, and
/// a single forest action color. Keep platform-native controls and behavior.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = Color(hex: 0xF9F9F7)
    static let panel = Color.white
    static let panel2 = Color(hex: 0xF4F4F2)
    static let raised = Color(hex: 0xDADAD8)
    static let border = Color(hex: 0xE5E5E1)

    // ── Text ─────────────────────────────────────────────────────────────────
    static let text = Color(hex: 0x1A1C1B)
    static let text2 = Color(hex: 0x414846)
    static let text3 = Color(hex: 0x717976)

    // ── Accent ───────────────────────────────────────────────────────────────
    static let accent = Color(hex: 0x1A3C34)
    static let accentSoft = Color(hex: 0xE1E9E6)
    static let accentDeep = Color(hex: 0x01261F)
    static let accentTint = Color(hex: 0x1A3C34, opacity: 0.10)

    // ── Semantic ─────────────────────────────────────────────────────────────
    static let destructive = Color(hex: 0xBA1A1A)
    static let signal = Color(hex: 0x2D5A27)
    static let success = Color(hex: 0x2D5A27)

    // ── Compatibility aliases ─────────────────────────────────────────────────
    // Legacy views still compile through these aliases, but all resolve to the
    // forest Precision palette—never violet or black.
    static let violet = accent
    static let violetSoft = accentSoft
    static let violetDeep = accentDeep
    static let purple = accent
    static let purpleDeep = accentDeep
    static let paper = canvas
    static let paperWarm = panel2
    static let ink = text

    // ── Geometry ─────────────────────────────────────────────────────────────
    static let radiusSm: CGFloat = 4
    static let radiusMd: CGFloat = 8
    static let radiusLg: CGFloat = 12
}

extension Color {
    /// Opaque RGB from a 24-bit hex literal, e.g. `Color(hex: 0x1A3C34)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    /// Native text remains native; hierarchy comes from weight and tracking,
    /// not a rounded display family that drifts from the web system.
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .semibold) -> Font {
        Font.system(style, design: .default).weight(weight)
    }

    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        Font.system(style, design: .monospaced).weight(weight)
    }

    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .default).weight(weight)
    }
}

/// Shared tactile feedback for intentionally tappable controls.
struct TouchPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.86 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeInOut(duration: 0.20), value: configuration.isPressed)
    }
}

/// The native equivalent of the Stitch root surface. Deliberately flat: the
/// design uses tonal layering and borders rather than decorative gradients.
struct BrandMeshBackground: View {
    var body: some View {
        Brand.canvas.ignoresSafeArea()
    }
}

extension View {
    /// Standard Wireline shell. Keep system navigation, materials, and Dynamic
    /// Type behavior; only the semantic palette comes from Stitch.
    func wirelineBrand() -> some View {
        self.tint(Brand.accent)
            .scrollContentBackground(.hidden)
            .background(BrandMeshBackground())
            .preferredColorScheme(.light)
    }

    func touchPress() -> some View {
        buttonStyle(TouchPressStyle())
    }

    /// Quiet grouped surface for native settings, assistant, and recap content.
    func brandGlowCard(radius: CGFloat = Brand.radiusMd, borderOpacity: Double = 1) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border.opacity(borderOpacity), lineWidth: 1)
            )
    }
}
