import SwiftUI

/// Native Wireline foundation. This is the mobile translation of the current
/// Stitch Professional Heritage system: warm paper surfaces, compact geometry,
/// quiet borders, and a single forest action color. Keep platform-native behavior.
enum Brand {
    // ── Surfaces ─────────────────────────────────────────────────────────────
    static let canvas = Color(hex: 0xF9F9F7)
    static let panel = Color.white
    static let panel2 = Color(hex: 0xF4F4F2)
    static let raised = Color(hex: 0xEEEEEC)
    static let border = Color(hex: 0xDADAD8)

    // ── Text ─────────────────────────────────────────────────────────────────
    // V7 uses the forest ink for primary hierarchy, not a competing charcoal.
    static let text = Color(hex: 0x1A3C34)
    static let text2 = Color(hex: 0x4A5F59)
    static let text3 = Color(hex: 0x4A5F59, opacity: 0.72)

    // ── Accent ───────────────────────────────────────────────────────────────
    static let accent = Color(hex: 0x1A3C34)
    static let accentSoft = Color(hex: 0xE1E9E6)
    static let accentDeep = Color(hex: 0x01261F)
    static let accentTint = Color(hex: 0x1A3C34, opacity: 0.10)

    // ── Semantic ─────────────────────────────────────────────────────────────
    static let destructive = Color(hex: 0xBA1A1A)
    static let signal = Color(hex: 0x2D5A27)
    static let success = Color(hex: 0x2D5A27)

    // ── Compatibility aliases ─────────────────────────────────────────────────
    // Legacy views still compile through these aliases, but all resolve to the
    // Professional Heritage palette—never violet or black.
    static let paper = canvas
    static let paperWarm = panel2
    static let ink = text

    // ── Geometry ─────────────────────────────────────────────────────────────
    static let radiusSm: CGFloat = 4
    static let radiusMd: CGFloat = 8
    static let radiusLg: CGFloat = 12
}

extension Color {
    /// Opaque RGB from a 24-bit hex literal, e.g. `Color(hex: 0x1A3C34)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

extension Font {
    /// Native text remains native; hierarchy comes from weight and tracking,
    /// not a rounded display family that drifts from the web system.
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

/// The shared 16pt-padded Professional Heritage card from the current handoff.
struct OperatorCard<Content: View>: View {
    private let content: Content
    private let radius: CGFloat

    init(radius: CGFloat = Brand.radiusMd, @ViewBuilder content: () -> Content) {
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

/// The native equivalent of the Stitch root surface. Deliberately flat: the
/// design uses tonal layering and borders rather than decorative gradients.
struct BrandMeshBackground: View {
    var body: some View { Brand.canvas.ignoresSafeArea() }
}

extension View {
    /// Standard Wireline shell. Keep system navigation, materials, and Dynamic
    /// Type behavior; only the semantic palette comes from Stitch.
    func wirelineBrand() -> some View {
        self.tint(Brand.accent)
            .buttonStyle(TouchPressStyle())
            .scrollContentBackground(.hidden)
            .background(BrandMeshBackground())
            .preferredColorScheme(.light)
    }

    func touchPress() -> some View { buttonStyle(TouchPressStyle()) }

    /// Surface modifier for views that already own their internal padding.
    func operatorCardSurface(radius: CGFloat = Brand.radiusMd, borderOpacity: Double = 1) -> some View {
        background(Brand.panel)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Brand.border.opacity(borderOpacity), lineWidth: 1)
            )
    }

    /// Backward-compatible name for existing views while they migrate to
    /// `OperatorCard` or `operatorCardSurface`.
    func brandGlowCard(radius: CGFloat = Brand.radiusMd, borderOpacity: Double = 1) -> some View {
        operatorCardSurface(radius: radius, borderOpacity: borderOpacity)
    }
}

// MARK: - Custom View Modifiers

/// The "Operator Card" - The atomic container for the Wireline UI.
/// Handles the 8pt radius, 1px stroke, and subtle brand-colored shadow.
public struct OperatorCardModifier: ViewModifier {
    public var isHoverable: Bool = true
    
    public init(isHoverable: Bool = true) {
        self.isHoverable = isHoverable
    }
    
    public func makeBody(content: Content) -> some View {
        content
            .padding(16)
            .background(Brand.panel)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Brand.border, lineWidth: 1)
            )
            .shadow(color: Brand.accent.opacity(0.05), radius: 2, x: 0, y: 1)
    }
}

/// Force-applies the "Linear-grade" tracking and Inter-specific features to text.
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
                .font(.system(size: 32, weight: .bold))
                .tracking(-0.64) // -0.02em
                .foregroundColor(Brand.text)
        case .headline:
            content
                .font(.system(size: 22, weight: .semibold))
                .tracking(-0.22) // -0.01em
                .foregroundColor(Brand.text)
        case .body:
            content
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(Brand.text)
        case .labelCaps:
            content
                .font(.system(size: 11, weight: .bold))
                .tracking(0.55) // 0.05em
                .textCase(.uppercase)
                .foregroundColor(Brand.text2)
        }
    }
}

// MARK: - Custom View Extensions
public extension View {
    func asOperatorCard(isHoverable: Bool = true) -> some View {
        modifier(OperatorCardModifier(isHoverable: isHoverable))
    }
    
    func operatorTextStyle(_ style: OperatorTextModifier.Style) -> some View {
        modifier(OperatorTextModifier(style: style))
    }
}

