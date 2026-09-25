import Foundation

enum OutboundConsentCopy {
    static let label =
        "I confirm I have permission to call this number for this purpose."
    static let help =
        "Required for outbound dialing. Marketing or promotional calls need express written consent."
    static let legalURL = URL(string: "https://botbound.app/trust/legal")!
    static let learnMore = "Learn more"
}
