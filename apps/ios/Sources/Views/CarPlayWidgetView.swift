import SwiftUI

/// Glanceable CarPlay widget view - Phase 4 Polished
/// Aligned with Aurora Cream design system (light elegant backgrounds, subtle purple accents).
/// Vigilant improvements: Consistent spacing, large touch targets, high contrast, accessibility notes.
struct CarPlayWidgetView: View {
    @StateObject private var manager = CarPlayManager()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {  // Improved spacing (design system 20px)
            HStack(spacing: 12) {
                Image(systemName: "brain.head.profile")
                    .font(.title)
                    .foregroundColor(Color.purple)  // Subtle brand accent
                Text("Wireline Agents")
                    .font(.title2.bold())
                    .foregroundColor(.primary)
            }
            
            Text("Connected • \(manager.connectedAgents) agents ready")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            VStack(spacing: 14) {  // Consistent 14px spacing
                ForEach(manager.quickActions, id: \.id) { action in
                    Button(action: {
                        manager.performQuickAction(action)
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: action.icon)
                                .font(.title3)
                            Text(action.label)
                                .font(.body.weight(.medium))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 14)  // Large touch target
                        .padding(.horizontal, 16)
                        .background(Color(.systemGray6))
                        .cornerRadius(14)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .accessibilityLabel(action.label)
                }
            }
            
            Spacer(minLength: 20)
        }
        .padding(24)  // Generous padding for premium feel
        .background(Color(.systemBackground))
    }
}
