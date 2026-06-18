import SwiftUI

/// Wireline's brand layer. Direction: **iOS-native first, brand accent second** —
/// we keep SF Pro, system materials, and standard controls (best HIG + App Store
/// fit), and layer Wireline's **"Midnight"** identity on top as the accent tint
/// and dark surfaces. Tokens mirror `src/index.css` + `DESIGN.md` (dark-only,
/// iris accent) so the app stays in sync with the web design system.
enum Brand {
    /// Primary accent — iris (`--iris` / `--primary` #7C9CFF). Global tint.
    /// (Kept the name `purple` to avoid churn across 30+ call sites; the value
    /// is the Midnight iris blue.)
    static let purple = Color(hex: 0x7C9CFF)
    /// Deep iris (`--iris-deep` #5570E6) for pressed / gradient ends.
    static let purpleDeep = Color(hex: 0x5570E6)
    /// Bright iris (`--iris-bright` #A9BEFF) for emphasis on dark.
    static let irisBright = Color(hex: 0xA9BEFF)
    /// Canvas (`--canvas` #0C0D11) — the app background.
    static let paper = Color(hex: 0x0C0D11)
    /// Deepest canvas (`--canvas-deep` #0A0B0E) for raised separation.
    static let paperWarm = Color(hex: 0x0A0B0E)
    /// Panel surface (`--panel` #14161D) for cards / sheets.
    static let panel = Color(hex: 0x14161D)
    /// Primary text (`--text` #ECEDF1).
    static let ink = Color(hex: 0xECEDF1)
    /// Live / positive signal (`--mint` #54E0B4).
    static let signal = Color(hex: 0x54E0B4)
    /// Attention (`--amber` #F4B45A).
    static let amber = Color(hex: 0xF4B45A)
    /// Destructive (`--destructive` #EF4444).
    static let destructive = Color(hex: 0xEF4444)
    /// Faint iris wash for tinted chips / selected rows (`--accent`).
    static let accentTint = Color(hex: 0x7C9CFF, opacity: 0.15)

    /// Explicit alias for new code (prefer `Brand.iris` going forward).
    static let iris = Color(hex: 0x7C9CFF)
}

extension Color {
    /// `Color(hex: 0x4F1E7B)` — opaque RGB from a 24-bit hex literal.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    /// Wireline display font. Midnight is sans-only (Plus Jakarta Sans on web);
    /// on iOS we approximate with SF Pro at a tight, bold display weight — no
    /// serif (the old Fraunces-era serif was removed in the Midnight rebuild).
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .bold) -> Font {
        return Font.system(style, design: .default).weight(weight)
    }
    
    /// Wireline mono font — uses iOS native monospaced to approximate JetBrains Mono
    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        return Font.system(style, design: .monospaced).weight(weight)
    }
    
    /// Wireline body font — uses iOS native sans-serif (SF Pro) to approximate Plus Jakarta Sans
    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        return Font.system(style, design: .default).weight(weight)
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
    /// Apply the Wireline brand: purple accent tint everywhere, obsidian dark grouped
    /// background under list/native surfaces. Keeps native control shapes.
    /// Razor-edge: rectangular surfaces use 0 radius (system lists respect this).
    func wirelineBrand() -> some View {
        self.tint(Brand.purple)
            .scrollContentBackground(.hidden)
            .background(Brand.paper.ignoresSafeArea())
            .preferredColorScheme(.dark)
    }
    
    /// Wireline zero-latency micro-transform for press states using physical-based spring dynamics
    func touchPress() -> some View {
        self.buttonStyle(TouchPressStyle())
    }

    /// Custom, premium dark glassmorphic border view modifier with subtle purple ambient glow.
    /// Aligns iOS cards with the web "Obsidian & Violet Glass" styling.
    func brandGlowCard(radius: CGFloat = 12, borderOpacity: Double = 0.12) -> some View {
        self.background(Brand.paperWarm)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .stroke(
                        LinearGradient(
                            colors: [Brand.purple.opacity(borderOpacity * 2.5), .clear, Brand.purpleDeep.opacity(borderOpacity * 1.5)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            )
            .shadow(color: Brand.purple.opacity(0.14), radius: 12, x: 0, y: 6)
    }
}
