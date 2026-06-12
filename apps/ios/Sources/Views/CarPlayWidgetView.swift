import SwiftUI

/// Glanceable CarPlay widget view
/// Matches the conceptual mockups created earlier.
/// Designed for dashboard display with large, safe touch targets.
struct CarPlayWidgetView: View {
    @StateObject private var manager = CarPlayManager()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "brain.head.profile")
                    .foregroundColor(.purple)
                Text("Wireline Agents")
                    .font(.title2.bold())
            }
            
            Text("Connected • \(manager.connectedAgents) agents ready")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            VStack(spacing: 12) {
                ForEach(manager.quickActions, id: \.id) { action in
                    Button(action: {
                        manager.performQuickAction(action)
                    }) {
                        HStack {
                            Image(systemName: action.icon)
                            Text(action.label)
                                .fontWeight(.medium)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            
            Spacer()
        }
        .padding()
        .background(Color(.systemBackground)) // Aurora Cream style light background
    }
}
