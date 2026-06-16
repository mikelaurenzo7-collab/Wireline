import SwiftUI

/// Wireline's brand layer. Direction: **iOS-native first, brand accent second** —
/// we keep SF Pro, system materials, and standard controls (best HIG + App Store
/// fit), and layer Wireline's "Rich Cream + Purple" identity on top as the accent
/// tint and surface tints. Tokens mirror `src/index.css` so the app stays in sync
/// with the web design system.
enum Brand {
    /// Primary purple (`--primary` #8B3FD6). Used as the global accent/tint.
    static let purple = Color(hex: 0x8B3FD6)
    /// Deep purple (`--color-brand-deep` #3B154C) for pressed/gradient ends.
    static let purpleDeep = Color(hex: 0x3B154C)
    /// Warm cream paper (`--paper` #F5F1E8).
    static let paper = Color(hex: 0xF5F1E8)
    /// A hair-warmer cream for raised surfaces (`--paper-warm` #ECE6D9).
    static let paperWarm = Color(hex: 0xECE6D9)
    /// Near-black ink (`--ink` #1A1614).
    static let ink = Color(hex: 0x1A1614)
    /// Success / live signal (`--wl-signal` #10B981).
    static let signal = Color(hex: 0x10B981)
    /// Destructive (`--destructive` #E8466A).
    static let destructive = Color(hex: 0xE8466A)
    /// Faint purple wash for tinted chips/selected rows (`--accent`).
    static let accentTint = Color(hex: 0x8B3FD6, opacity: 0.10)
}

extension Color {
    /// `Color(hex: 0x8B3FD6)` — opaque RGB from a 24-bit hex literal.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension View {
    /// Apply the Wireline brand: purple accent tint everywhere, cream grouped
    /// background under list/native surfaces. Keeps native control shapes.
    func wirelineBrand() -> some View {
        self.tint(Brand.purple)
            .scrollContentBackground(.hidden)
            .background(Brand.paper.ignoresSafeArea())
    }
}
