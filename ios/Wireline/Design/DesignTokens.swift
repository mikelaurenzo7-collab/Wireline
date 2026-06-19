import SwiftUI

/// Lavender Noir layout tokens — radii and typography scale.
/// Color lives in `Brand` (`WirelineTheme.swift`); this file is radii + helpers only.
enum DesignTokens {
    static let radiusSm: CGFloat = Brand.radiusSm
    static let radiusMd: CGFloat = Brand.radiusMd
    static let radiusLg: CGFloat = Brand.radiusLg

    static let titleFont = Font.display(.title2)
    static let bodyFont = Font.ui(.body)
    static let monoFont = Font.mono(.caption)
}

extension View {
    func wirelineCard() -> some View {
        brandGlowCard(radius: DesignTokens.radiusMd)
    }
}
