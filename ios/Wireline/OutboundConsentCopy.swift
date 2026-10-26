import Foundation

/// Plain outbound copy. Keep these sentences identical to the web dialer.
enum OutboundConsentCopy {
    static let permission = "I have this person's permission to contact them."
    static let nonsales = "This isn't selling anything."
    static let salesAttestation =
        "I'm responsible for having permission to contact the people I call or text for sales, and for following Do Not Call rules."
    static let legalURL = URL(string: "https://botbound.app/trust/legal")!
    static let learnMore = "Learn more"
    static let label = permission
}

enum OutboundPurposeCopy {
    static let appointment = "appointment_service"
    static let callback = "callback"
    static let sales = "sales"
    static let appointmentLabel = "Appointment/service"
    static let callbackLabel = "Callback"
    static let salesLabel = "Sales"
}
