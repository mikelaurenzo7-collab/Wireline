import SwiftUI
import UIKit

/// CarPlay chrome uses generated Wireline tokens so grid icons and future
/// custom assets stay aligned with widget and in-app dark Letterpress surfaces.
enum CarPlayPalette {
    static let accent = WirelineDesignTokens.ColorToken.colorActionPrimaryDefault
    static let wire = WirelineDesignTokens.ColorToken.colorActionSecondaryDefault
    static let text = WirelineDesignTokens.ColorToken.colorTextPrimary
    static let textSecondary = WirelineDesignTokens.ColorToken.colorTextSecondary

    static var accentUiColor: UIColor { UIColor(accent) }
    static var wireUiColor: UIColor { UIColor(wire) }
}
