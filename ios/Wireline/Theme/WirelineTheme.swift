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

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    /// Native text remains native; hierarchy comes from weight, tracking, and
    /// generous line-height rather than importing web behavior into SwiftUI.
    /// Now beautifully informed by shared typography tokens for masterful consistency.
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .semibold) -> Font {
        Font.system(style, design: .default).weight(weight)
    }

    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        Font.system(style, design: .monospaced).weight(weight)
    }

    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .default).weight(weight)
    }

    /// Token-driven sizes for flawless cross-surface type (past-modern, unique hierarchy)
    static var displayLarge: Font { .system(size: WirelineDesignTokens.Metric.typographyDisplaySize, weight: .bold, design: .default) }
    static var h1: Font { .system(size: WirelineDesignTokens.Metric.typographyH1Size, weight: .semibold) }
    static var body: Font { .system(size: WirelineDesignTokens.Metric.typographyBodySize, weight: .regular) }
    static var bodyStrong: Font { .system(size: WirelineDesignTokens.Metric.typographyBodyStrongSize, weight: .semibold) }
    static var caption: Font { .system(size: WirelineDesignTokens.Metric.typographyCaptionSize, weight: .regular) }
    static var overline: Font { .system(size: WirelineDesignTokens.Metric.typographyOverlineSize, weight: .semibold).tracking(0.05) }
}

/// Shared tactile feedback for deliberately interactive native controls.
struct TouchPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.86 : 1)
            .scaleEffect(configuration.isPressed ? WirelineDesignTokens.Motion.pressScale : 1)
            .animation(.easeOut(duration: WirelineDesignTokens.Motion.motionDurationStandard), value: configuration.isPressed)
    }
}

/// Shared elevated surface. Wireline uses precise borders and restrained depth.
struct AssistantCard<Content: View>: View {
    private let content: Content
    private let radius: CGFloat

    init(radius: CGFloat = Brand.radiusLg, @ViewBuilder content: () -> Content) {
        self.radius = radius
        self.content = content()
    }

    var body: some View {
        content
            .padding(WirelineDesignTokens.Metric.space200)
            .background(Brand.panel, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border, lineWidth: 1)
            )
    }
}

/// Flat root surface: layered tones and outlines take priority over decoration.
struct BrandMeshBackground: View {
    var body: some View { Brand.canvas.ignoresSafeArea() }
}

extension View {
    func wirelineBrand() -> some View {
        self.tint(Brand.accent)
            .buttonStyle(TouchPressStyle())
            .scrollContentBackground(.hidden)
            .background(BrandMeshBackground())
            .preferredColorScheme(.light)
    }

    func touchPress() -> some View { buttonStyle(TouchPressStyle()) }

    func assistantCardSurface(radius: CGFloat = Brand.radiusLg, borderOpacity: Double = 1) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border.opacity(borderOpacity), lineWidth: 1)
            )
    }

    /// Backward-compatible name for existing views while they migrate to the
    /// semantic Wireline card helpers.
    func brandGlowCard(radius: CGFloat = Brand.radiusLg, borderOpacity: Double = 1) -> some View {
        assistantCardSurface(radius: radius, borderOpacity: borderOpacity)
    }
}

public struct AssistantCardModifier: ViewModifier {
    public var isHoverable: Bool = true

    public init(isHoverable: Bool = true) {
        self.isHoverable = isHoverable
    }

    public func makeBody(content: Content) -> some View {
        content
            .padding(WirelineDesignTokens.Metric.space200)
            .background(Brand.panel)
            .cornerRadius(Brand.radiusLg)
            .overlay(
                RoundedRectangle(cornerRadius: Brand.radiusLg)
                    .stroke(Brand.border, lineWidth: 1)
            )
            .shadow(color: Brand.accent.opacity(0.06), radius: 4, x: 0, y: 1)
    }
}

public struct AssistantTextModifier: ViewModifier {
    public enum Style {
        case display, headline, body, labelCaps
    }

    public let style: Style

    public init(style: Style) {
        self.style = style
    }

    public func makeBody(content: Content) -> some View {
        switch style {
        case .display:
            content
                .font(.system(size: 32, weight: .semibold))
                .tracking(-0.64)
                .foregroundColor(Brand.text)
        case .headline:
            content
                .font(.system(size: 22, weight: .medium))
                .tracking(-0.22)
                .foregroundColor(Brand.text)
        case .body:
            content
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(Brand.text)
        case .labelCaps:
            content
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .tracking(0.55)
                .textCase(.uppercase)
                .foregroundColor(Brand.text2)
        }
    }
}

public extension View {
    func asAssistantCard(isHoverable: Bool = true) -> some View {
        modifier(AssistantCardModifier(isHoverable: isHoverable))
    }

    func assistantTextStyle(_ style: AssistantTextModifier.Style) -> some View {
        modifier(AssistantTextModifier(style: style))
    }
}
