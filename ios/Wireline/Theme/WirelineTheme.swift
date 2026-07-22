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

/// Flat root surface: layered tones, faint ledger ruling, restrained depth.
struct BrandMeshBackground: View {
    var body: some View {
        ZStack {
            Brand.canvas
            LinearGradient(
                colors: [
                    Brand.wireSoft.opacity(0.14),
                    Color.clear,
                    Brand.accentSoft.opacity(0.08),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .ignoresSafeArea()
    }
}

extension View {
    func wirelineBrand() -> some View {
        self.tint(Brand.accent)
            .buttonStyle(TouchPressStyle())
            .scrollContentBackground(.hidden)
            .background(BrandMeshBackground())
    }

    func touchPress() -> some View { buttonStyle(TouchPressStyle()) }

    func assistantCardSurface(radius: CGFloat = Brand.radiusLg, borderOpacity: Double = 1) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border.opacity(borderOpacity), lineWidth: 1)
            )
            .overlay(alignment: .top) {
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [Brand.wire, Brand.accent.opacity(0.35), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(height: 2)
                    .padding(.horizontal, WirelineDesignTokens.Metric.space200)
                    .padding(.top, 1)
            }
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
                .font(.system(size: 32, weight: .regular, design: .serif))
                .tracking(-0.64)
                .foregroundColor(Brand.text)
        case .headline:
            content
                .font(.system(size: 22, weight: .regular, design: .serif))
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
