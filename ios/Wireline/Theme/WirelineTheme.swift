import SwiftUI

/// Wireline's brand layer. Direction: **iOS-native first, brand accent second** —
/// we keep SF Pro, system materials, and standard controls (best HIG + App Store
/// fit), and layer Wireline's "Rich Cream + Purple" identity on top as the accent
/// tint and surface tints. Tokens mirror `src/index.css` so the app stays in sync
/// with the web design system.
enum Brand {
    /// Primary purple (`--primary` #8B5CF6). Used as the global accent/tint.
    static let purple = Color(hex: 0x8B5CF6)
    /// Deep purple (`--color-brand-deep` #4C1D95) for pressed/gradient ends.
    static let purpleDeep = Color(hex: 0x4C1D95)
    /// Warm dark paper (`--paper` #09090B).
    static let paper = Color(hex: 0x09090B)
    /// A hair-warmer dark for raised surfaces (`--paper-warm` #020204).
    static let paperWarm = Color(hex: 0x020204)
    /// Near-white ink (`--ink` #F8FAFC).
    static let ink = Color(hex: 0xF8FAFC)
    /// Success / live signal (`--wl-signal` #10B981).
    static let signal = Color(hex: 0x10B981)
    /// Destructive (`--destructive` #EF4444).
    static let destructive = Color(hex: 0xEF4444)
    /// Faint purple wash for tinted chips/selected rows (`--accent`).
    static let accentTint = Color(hex: 0x8B5CF6, opacity: 0.15)
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
    /// Wireline display font — uses iOS native serif to approximate Fraunces with premium display editorial scale
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .bold) -> Font {
        return Font.system(style, design: .serif).weight(weight)
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
