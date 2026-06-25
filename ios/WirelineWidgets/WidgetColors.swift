import SwiftUI

/// Widget palette shared by all extension views. WidgetKit stays intentionally
/// glanceable, while its semantic color and typography anchors resolve from the
/// same DTCG source as the app and web surfaces.
enum WidgetColors {
    static let accent = WirelineTokens.ColorToken.colorActionPrimaryDefault
    static let accentDeep = WirelineTokens.ColorToken.colorActionPrimaryPressed
    static let accentSoft = WirelineTokens.ColorToken.colorActionPrimaryContainer
    static let canvas = WirelineTokens.ColorToken.colorCanvasDefault
    static let panel = WirelineTokens.ColorToken.colorSurfaceDefault
    static let panel2 = WirelineTokens.ColorToken.colorSurfaceSubtle
    static let text = WirelineTokens.ColorToken.colorTextPrimary
    static let text2 = WirelineTokens.ColorToken.colorTextSecondary
    static let text3 = text2.opacity(0.72)
    static let border = WirelineTokens.ColorToken.colorBorderDefault
}
