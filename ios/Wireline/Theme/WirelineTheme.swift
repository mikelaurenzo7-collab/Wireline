import SwiftUI

/// Native Wireline Precision foundation. Keep platform-native behavior while
/// mirroring the current Stitch source: slate-blue surfaces, precise outlines,
/// compact geometry, and a single signalBlue action color.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = Color(hex: 0xF8F9FF)
    static let panel = Color.white
    static let panel2 = Color(hex: 0xEFF4FF)
    static let raised = Color(hex: 0xE5EEFF)
    static let border = Color(hex: 0xC9C4D7)

    // ── Text ─────────────────────────────────────────────────────────────────
    static let text = Color(hex: 0x0B1C30)
    static let text2 = Color(hex: 0x484554)
    static let text3 = Color(hex: 0x484554, opacity: 0.72)

    // ── Accent ───────────────────────────────────────────────────────────────
    static let accent = Color(hex: 0x5D3FD3)
    static let accentSoft = Color(hex: 0xD8CEFF)
    static let accentDeep = Color(hex: 0x1C0062)
    static let accentTint = Color(hex: 0x5D3FD3, opacity: 0.10)

    // ── Semantic ─────────────────────────────────────────────────────────────
    static let destructive = Color(hex: 0xBA1A1A)
    static let signal = Color(hex: 0x2E7D32)
    static let success = signal

    // ── Compatibility aliases ─────────────────────────────────────────────────
    static let paper = canvas
    static let paperWarm = panel2
    static let ink = text

    // ── Geometry ─────────────────────────────────────────────────────────────
    static let radiusSm: CGFloat = 2
    static let radiusMd: CGFloat = 4
    static let radiusLg: CGFloat = 8
    static let radiusXl: CGFloat = 12
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
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.20), value: configuration.isPressed)
    }
}

/// Shared elevated surface. Signal Blue uses precise borders and restrained depth.
struct OperatorCard<Content: View>: View {
    private let content: Content
    private let radius: CGFloat

    init(radius: CGFloat = Brand.radiusLg, @ViewBuilder content: () -> Content) {
        self.radius = radius
        self.content = content()
    }

    var body: some View {
        content
            .padding(16)
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

    func operatorCardSurface(radius: CGFloat = Brand.radiusLg, borderOpacity: Double = 1) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border.opacity(borderOpacity), lineWidth: 1)
            )
    }

    /// Backward-compatible name for existing views while they migrate to the
    /// semantic Signal Blue card helpers.
    func brandGlowCard(radius: CGFloat = Brand.radiusLg, borderOpacity: Double = 1) -> some View {
        operatorCardSurface(radius: radius, borderOpacity: borderOpacity)
    }
}

public struct OperatorCardModifier: ViewModifier {
    public var isHoverable: Bool = true

    public init(isHoverable: Bool = true) {
        self.isHoverable = isHoverable
    }

    public func makeBody(content: Content) -> some View {
        content
            .padding(16)
            .background(Brand.panel)
            .cornerRadius(Brand.radiusLg)
            .overlay(
                RoundedRectangle(cornerRadius: Brand.radiusLg)
                    .stroke(Brand.border, lineWidth: 1)
            )
            .shadow(color: Brand.accent.opacity(0.06), radius: 4, x: 0, y: 1)
    }
}

public struct OperatorTextModifier: ViewModifier {
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
    func asOperatorCard(isHoverable: Bool = true) -> some View {
        modifier(OperatorCardModifier(isHoverable: isHoverable))
    }

    func operatorTextStyle(_ style: OperatorTextModifier.Style) -> some View {
        modifier(OperatorTextModifier(style: style))
    }
}
