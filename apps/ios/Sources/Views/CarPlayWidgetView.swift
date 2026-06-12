import SwiftUI

/// CarPlay Widget View - HIG Aligned
/// Designed for glanceability and safety per Apple Human Interface Guidelines.
/// Large touch targets, clear hierarchy, minimal visual noise.
struct CarPlayWidgetView: View {
    @StateObject private var manager = CarPlayManager()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            // Header - Clear and scannable
            HStack(spacing: 12) {
                Image(systemName: "brain.head.profile")
                    .font(.title2)
                    .foregroundColor(.purple)
                    .accessibilityHidden(true)
                
                Text("Wireline Agents")
                    .font(.title2.bold())
            }
            
            // Status - Glanceable
            Text("Connected • \(manager.connectedAgents) agents ready")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            // Quick Actions - Large touch targets
            VStack(spacing: 16) {
                ForEach(manager.quickActions, id: \.id) { action in
                    Button(action: {
                        manager.performQuickAction(action)
                    }) {
                        HStack(spacing: 14) {
                            Image(systemName: action.icon)
                                .font(.title3)
                            Text(action.label)
                                .font(.body.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 16)   // Large touch target
                        .padding(.horizontal, 18)
                        .background(Color(.systemGray6))
                        .cornerRadius(14)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .accessibilityLabel(action.label)
                }
            }
            
            Spacer(minLength: 16)
        }
        .padding(28)  // Generous, safe padding
        .background(Color(.systemBackground))
    }
}
