import SwiftUI

/// Native Wireline foundation. Platform controls stay native while semantic values
/// are generated from the shared DTCG token source used by web and extension surfaces.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = WirelineDesignTokens.ColorToken.colorCanvasDefault
    static let panel = WirelineDesignTokens.ColorToken.colorSurfaceDefault
    static let panel2 = WirelineDesignTokens.ColorToken.colorSurfaceSubtle
    static let raised = WirelineDesignTokens.ColorToken.colorSurfaceContainer
    static let border = WirelineDesignTokens.ColorToken.colorBorderDefault
    static let borderStrong = WirelineDesignTokens.ColorToken.colorBorderStrong

    // ── Text ─────────────────────────────────────────────────────────────────
    static let text = WirelineDesignTokens.ColorToken.colorTextPrimary
    static let text2 = WirelineDesignTokens.ColorToken.colorTextSecondary
    static let text3 = WirelineDesignTokens.ColorToken.colorTextSecondary.opacity(0.72)

    // ── Action ───────────────────────────────────────────────────────────────
    static let primary = WirelineDesignTokens.ColorToken.colorActionPrimaryDefault
    static let primaryContainer = WirelineDesignTokens.ColorToken.colorActionPrimaryDefault
    static let primaryFixed = WirelineDesignTokens.ColorToken.colorSurfaceSubtle
    static let primaryFixedDim = WirelineDesignTokens.ColorToken.colorSurfaceContainer
    static let accent = primaryContainer
    static let accentSoft = WirelineDesignTokens.ColorToken.colorActionPrimaryContainer
    static let accentDeep = WirelineDesignTokens.ColorToken.colorTextPrimary
    static let accentTint = WirelineDesignTokens.ColorToken.colorActionPrimaryContainer

    /// Copper wire — the signature accent on cards and chrome (secondary action token).
    static let wire = WirelineDesignTokens.ColorToken.colorActionSecondaryDefault
    static let wireSoft = WirelineDesignTokens.ColorToken.colorActionSecondaryContainer

    // ── Semantic feedback ────────────────────────────────────────────────────
    static let destructive = WirelineDesignTokens.ColorToken.colorStatusError
    static let signal = WirelineDesignTokens.ColorToken.colorStatusSuccess
    static let success = signal

    // ── Compatibility aliases ─────────────────────────────────────────────────
    static let paper = canvas
    static let paperWarm = panel2
    static let ink = text

    // ── Geometry ─────────────────────────────────────────────────────────────
    static let radiusSm = WirelineDesignTokens.Metric.radiusSm
    static let radiusMd = WirelineDesignTokens.Metric.radiusMd
    static let radiusLg = WirelineDesignTokens.Metric.radiusLg
    static let radiusXl = WirelineDesignTokens.Metric.radiusXl
}

extension Font {
    /// Letterpress hierarchy on native: display uses the system serif (New York)
    /// to carry Instrument Serif's serif-display character, labels use the system
    /// monospace (echoing Space Mono), and body/UI stay in the system sans. No
    /// custom font bundling required — graceful and platform-native.
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .serif).weight(weight)
    }

    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        Font.system(style, design: .monospaced).weight(weight)
    }

    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .default).weight(weight)
    }

    /// Token-driven sizes for flawless cross-surface type. Display tiers are
    /// serif at regular weight, matching the Letterpress Instrument Serif.
    static var displayLarge: Font { .system(size: WirelineDesignTokens.Metric.typographyDisplaySize, weight: .regular, design: .serif) }
    static var h1: Font { .system(size: WirelineDesignTokens.Metric.typographyH1Size, weight: .regular, design: .serif) }
    static var body: Font { .system(size: WirelineDesignTokens.Metric.typographyBodySize, weight: .regular) }
    static var bodyStrong: Font { .system(size: WirelineDesignTokens.Metric.typographyBodyStrongSize, weight: .semibold) }
    static var caption: Font { .system(size: WirelineDesignTokens.Metric.typographyCaptionSize, weight: .regular) }
    static var overline: Font { .system(size: WirelineDesignTokens.Metric.typographyOverlineSize, weight: .semibold, design: .monospaced).tracking(0.08) }
}
