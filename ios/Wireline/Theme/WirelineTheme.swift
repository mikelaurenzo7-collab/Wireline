import SwiftUI

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
