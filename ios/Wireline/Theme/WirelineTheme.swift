import SwiftUI

/// Wireline's brand layer. Direction: **iOS-native first, brand accent second** —
/// we keep SF Pro, system materials, and standard controls (best HIG + App Store
/// fit), and layer Wireline's "Rich Cream + Purple" identity on top as the accent
/// tint and surface tints. Tokens mirror `src/index.css` so the app stays in sync
/// with the web design system.
enum Brand {
    /// Primary purple (`--primary` #4F1E7B). Used as the global accent/tint.
    static let purple = Color(hex: 0x4F1E7B)
    /// Deep purple (`--color-brand-deep` #3B154C) for pressed/gradient ends.
    static let purpleDeep = Color(hex: 0x3B154C)
    /// Warm cream paper (`--paper` #EFE9DC).
    static let paper = Color(hex: 0xEFE9DC)
    /// A hair-warmer cream for raised surfaces (`--paper-warm` #E5DECE).
    static let paperWarm = Color(hex: 0xE5DECE)
    /// Near-black ink (`--ink` #1A1614).
    static let ink = Color(hex: 0x1A1614)
    /// Success / live signal (`--wl-signal` #10B981).
    static let signal = Color(hex: 0x10B981)
    /// Destructive (`--destructive` #E8466A).
    static let destructive = Color(hex: 0xE8466A)
    /// Faint purple wash for tinted chips/selected rows (`--accent`).
    static let accentTint = Color(hex: 0x4F1E7B, opacity: 0.10)
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
    /// Wireline display font — uses iOS native serif to approximate Fraunces for iOS-native parity
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
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6, blendDuration: 0), value: configuration.isPressed)
    }
}

extension View {
    /// Apply the Wireline brand: purple accent tint everywhere, cream grouped
    /// background under list/native surfaces. Keeps native control shapes.
    /// Razor-edge: rectangular surfaces use 0 radius (system lists respect this).
    func wirelineBrand() -> some View {
        self.tint(Brand.purple)
            .scrollContentBackground(.hidden)
            .background(Brand.paper.ignoresSafeArea())
    }
    
    /// Wireline zero-latency micro-transform for press states
    func touchPress() -> some View {
        self.buttonStyle(TouchPressStyle())
    }
}
