import SwiftUI

/// Voice Control View - HIG Aligned for CarPlay
/// Voice-first design with minimal visual distraction during conversations.
/// Large, clear action buttons. Follows Apple guidance for conversational apps.
struct VoiceControlView: View {
    @State private var isListening = false
    @State private var transcript = "What are today’s hot leads?"
    @State private var agentResponse = "You have 4 qualified leads today. The top one is Apex Software - interested in demo."
    
    var body: some View {
        VStack(spacing: 32) {
            // Minimal header during conversation
            HStack(spacing: 12) {
                Image(systemName: isListening ? "waveform" : "mic.fill")
                    .font(.title)
                    .foregroundColor(.purple)
                Text(isListening ? "Listening..." : "Talking to your SDR Agent...")
                    .font(.headline)
            }
            
            // Conversation - Clean and readable
            VStack(alignment: .leading, spacing: 20) {
                Text(transcript)
                    .padding(18)
                    .background(Color(.systemGray5))
                    .cornerRadius(16)
                    .font(.body)
                
                Text(agentResponse)
                    .padding(18)
                    .background(Color.purple.opacity(0.1))
                    .cornerRadius(16)
                    .font(.body)
            }
            
            // Large, safe action buttons
            HStack(spacing: 14) {
                Button("Call Lead") {
                    // Action
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
                .controlSize(.large)
                
                Button("Add Note") {
                    // Action
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                
                Button("End") {
                    isListening = false
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            
            Spacer()
        }
        .padding(28)
        .background(Color(.systemBackground))
    }
}
