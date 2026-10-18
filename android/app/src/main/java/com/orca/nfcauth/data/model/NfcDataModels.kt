package com.orca.nfcauth.data.model

import kotlinx.serialization.Serializable

/**
 * NFC 태그 NDEF URL에서 추출된 원시 파라미터 데이터
 */
data class NfcPayload(
    val uid: String,
    val counterHex: String,
    val mac: String,
    val kid: String = "1",
    val rawUrl: String = "",
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Supabase Edge Function (/v1/nfc?format=json) 검증 응답 모델
 */
@Serializable
data class VerificationResponse(
    val success: Boolean = false,
    val resultCode: String = "UNKNOWN",
    val uid: String? = null,
    val counter: Long? = null,
    val tagName: String? = null,
    val totalScans: Int? = null,
    val firstVerifiedAt: String? = null,
    val productInfo: ProductInfo? = null,
    val message: String? = null,
    // 클라이언트에서 측정하는 서버 응답 시간 (ms)
    var latencyMs: Long = 0
)

@Serializable
data class ProductInfo(
    val brand: String? = null,
    val model: String? = null,
    val serialNumber: String? = null,
    val description: String? = null,
    val supportUrl: String? = null
)
