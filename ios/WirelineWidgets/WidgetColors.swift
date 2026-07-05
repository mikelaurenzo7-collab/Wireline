import SwiftUI

/// Widget palette aligned to generated WirelineDesignTokens in WirelineShared.
enum WidgetColors {
    static let wire = WirelineDesignTokens.ColorToken.colorActionSecondaryDefault
    static let wireSoft = WirelineDesignTokens.ColorToken.colorActionSecondaryContainer
    static let accent = WirelineDesignTokens.ColorToken.colorActionPrimaryDefault
    static let accentDeep = WirelineDesignTokens.ColorToken.colorActionPrimaryPressed
    static let accentSoft = WirelineDesignTokens.ColorToken.colorActionPrimaryContainer
    static let canvas = WirelineDesignTokens.ColorToken.colorCanvasDefault
    static let panel = WirelineDesignTokens.ColorToken.colorSurfaceDefault
    static let panel2 = WirelineDesignTokens.ColorToken.colorSurfaceSubtle
    static let text = WirelineDesignTokens.ColorToken.colorTextPrimary
    static let text2 = WirelineDesignTokens.ColorToken.colorTextSecondary
    static let text3 = WirelineDesignTokens.ColorToken.colorTextTertiary
    static let border = WirelineDesignTokens.ColorToken.colorBorderDefault
}