package com.wireline.app.widget

data class WirelineWidgetSnapshot(
    val needsAttention: Int = 0,
    val activeCallLabel: String? = null,
    val activeCallCount: Int = 0,
    val balanceUsd: Double? = null,
    val signedIn: Boolean = false,
    val updatedAt: Long = 0L,
) {
    companion object {
        val empty = WirelineWidgetSnapshot()
    }
}
