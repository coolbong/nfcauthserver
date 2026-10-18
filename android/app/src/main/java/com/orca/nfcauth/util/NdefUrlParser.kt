package com.orca.nfcauth.util

import android.net.Uri
import com.orca.nfcauth.data.model.NfcPayload

object NdefUrlParser {

    /**
     * NDEF URL 문자열로부터 uid, cnt, mac, kid 파라미터를 추출합니다.
     * 지원 형식:
     * - https://coolbong.github.io/nfcauthserver/?uid=04DE5F1EACC040&cnt=00003D&mac=94EED9EE65337086&kid=1
     * - https://xxx.co/v1/nfc?uid=...&cnt=...&mac=...
     */
    fun parse(rawUrl: String): NfcPayload? {
        if (rawUrl.isBlank()) return null

        try {
            val uri = Uri.parse(rawUrl.trim())
            val uid = uri.getQueryParameter("uid")?.trim() ?: extractQueryParam(rawUrl, "uid")
            val cnt = uri.getQueryParameter("cnt")?.trim()
                ?: uri.getQueryParameter("ctr")?.trim()
                ?: extractQueryParam(rawUrl, "cnt")
                ?: extractQueryParam(rawUrl, "ctr")
            val mac = uri.getQueryParameter("mac")?.trim()
                ?: uri.getQueryParameter("c")?.trim()
                ?: extractQueryParam(rawUrl, "mac")
                ?: extractQueryParam(rawUrl, "c")
            val kid = uri.getQueryParameter("kid")?.trim()
                ?: uri.getQueryParameter("kno")?.trim()
                ?: extractQueryParam(rawUrl, "kid")
                ?: extractQueryParam(rawUrl, "kno")
                ?: "1"

            if (uid.isNullOrBlank() || cnt.isNullOrBlank() || mac.isNullOrBlank()) {
                return null
            }

            return NfcPayload(
                uid = uid.uppercase(),
                counterHex = cnt.uppercase(),
                mac = mac.uppercase(),
                kid = kid,
                rawUrl = rawUrl
            )
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }

    private fun extractQueryParam(url: String, key: String): String? {
        val regex = Regex("""[?&]$key=([^&]+)""", RegexOption.IGNORE_CASE)
        return regex.find(url)?.groupValues?.getOrNull(1)
    }
}
