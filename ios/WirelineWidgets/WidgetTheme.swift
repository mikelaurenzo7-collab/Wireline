import SwiftUI

/// Midnight design tokens for the widget extension.
///
/// The widget target can't import the app's `Brand`/`WirelineTheme`, so this is
/// the single source of truth for widget color + type. It mirrors the web
/// tokens in `src/index.css` and `DESIGN.md` ("Midnight", dark-only):
///   canvas #0C0D11 · panel #14161D · iris #7C9CFF · mint #54E0B4 · amber #F4B45A
///
/// Keep every widget pulling from here so the phone-screen + Lock Screen surfaces
/// stay one cohesive system with the app and the web control panel.
enum WidgetTheme {
    // Surfaces
    static let canvas = Color(hex: 0x0C0D11)
    static let panel = Color(hex: 0x14161D)
    static let panelRaised = Color(hex: 0x191C24)

    // Accent (iris) — rare + meaningful, per DESIGN.md
    static let iris = Color(hex: 0x7C9CFF)
    static let irisBright = Color(hex: 0xA9BEFF)
    static let irisDeep = Color(hex: 0x5570E6)

    // Signals
    static let mint = Color(hex: 0x54E0B4) // live / positive
    static let amber = Color(hex: 0xF4B45A) // attention

    // Text
    static let text = Color(hex: 0xECEDF1)
    static let textSecondary = Color(hex: 0x9B9DA8)

    /// The accent gradient used on filled Home-screen tiles. Calm, single
    /// direction — no competing gradients (DESIGN.md §1.4).
    static let accentGradient = LinearGradient(
        colors: [Color(hex: 0x5570E6), Color(hex: 0x7C9CFF)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    /// Dark panel tile background for data widgets (counts, balances).
    static let panelGradient = LinearGradient(
        colors: [Color(hex: 0x14161D), Color(hex: 0x0C0D11)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension Color {
    /// `Color(hex: 0x7C9CFF)` — opaque RGB from a 24-bit hex literal.
    /// Defined here for the widget target (the app target has its own copy).
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
