import SwiftUI

/// Native visual foundation backed by the generated Wireline token contract.
/// Platform controls and typography remain native; surfaces, color, geometry, and
/// interaction feedback resolve from the same semantic source as web and widgets.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = WirelineTokens.ColorToken.colorCanvasDefault
    static let panel = WirelineTokens.ColorToken.colorSurfaceDefault
    static let panel2 = WirelineTokens.ColorToken.colorSurfaceSubtle
    static let raised = WirelineTokens.ColorToken.colorSurfaceContainer
    static let border = WirelineTokens.ColorToken.colorBorderDefault

    // ── Text ─────────────────────────────────────────────────────────────────
    static let text = WirelineTokens.ColorToken.colorTextPrimary
    static let text2 = WirelineTokens.ColorToken.colorTextSecondary
    static let text3 = text2.opacity(0.72)

    // ── Accent ───────────────────────────────────────────────────────────────
    static let primary = WirelineTokens.ColorToken.colorActionPrimaryDefault
    static let primaryPressed = WirelineTokens.ColorToken.colorActionPrimaryPressed
    static let primaryContainer = primary
    static let primaryFixed = Color(hex: 0xE6DEFF)
    static let primaryFixedDim = Color(hex: 0xCABEFF)
    static let accent = primary
    static let accentSoft = Color(hex: 0xD8CEFF)
    static let accentDeep = Color(hex: 0x1C0062)
    static let accentTint = WirelineTokens.ColorToken.colorActionPrimaryContainer

    // ── Semantic ─────────────────────────────────────────────────────────────
    static let destructive = WirelineTokens.ColorToken.colorStatusError
    static let signal = WirelineTokens.ColorToken.colorStatusSuccess
    static let success = signal

    // ── Compatibility aliases ─────────────────────────────────────────────────
    static let paper = canvas
    static let paperWarm = panel2
    static let ink = text

    // ── Geometry ─────────────────────────────────────────────────────────────
    static let radiusSm = WirelineTokens.Radius.radiusSm
    static let radiusMd = WirelineTokens.Radius.radiusMd
    static let radiusLg = WirelineTokens.Radius.radiusLg
    static let radiusXl = WirelineTokens.Radius.radiusXl
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
    static func display(_ style: Font.TextStyle, weight: Font.Weight = .semibold) -> Font {
        Font.system(style, design: .default).weight(weight)
    }

    static func mono(_ style: Font.TextStyle, weight: Font.Weight = .medium) -> Font {
        Font.system(style, design: .monospaced).weight(weight)
    }

    static func ui(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        Font.system(style, design: .default).weight(weight)
    }
}

/// Shared tactile feedback for deliberately interactive native controls.
struct TouchPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.86 : 1)
            .scaleEffect(configuration.isPressed ? WirelineTokens.Motion.motionPress : 1)
            .animation(.easeOut(duration: WirelineTokens.Motion.motionDurationStandard), value: configuration.isPressed)
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
            .padding(WirelineTokens.Space.space200)
            .background(Brand.panel, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border, lineWidth: 1)
            )
    }
}

/// Flat root surface: the source uses layered tones and outlines rather than gradients.
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
    /// semantic card helpers.
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
            .padding(WirelineTokens.Space.space200)
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
