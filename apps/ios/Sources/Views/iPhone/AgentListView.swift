import SwiftUI

/// Polished Agent List view for iPhone companion app
struct AgentListView: View {
    let agents = [
        (name: "SDR Agent", role: "Sales Development", status: "Ready"),
        (name: "CS Agent", role: "Customer Success", status: "Busy"),
        (name: "Demo Agent", role: "Demo Booker", status: "Ready")
    ]
    
    var body: some View {
        List(agents, id: \.name) { agent in
            HStack {
                VStack(alignment: .leading) {
                    Text(agent.name)
                        .font(.headline)
                    Text(agent.role)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Text(agent.status)
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(agent.status == "Ready" ? Color.green.opacity(0.2) : Color.orange.opacity(0.2))
                    .cornerRadius(8)
            }
            .padding(.vertical, 4)
        }
        .navigationTitle("Your Agents")
    }
}
